import { and, eq, ne, sql } from 'drizzle-orm';
import { resolve } from '$app/paths';
import { ORIGIN, WEBHOOK_INCLUDE_PII, WEBHOOK_URL } from '$app/env/private';
import { db } from './db';
import { bookingPreferences, bookings, experiments, sessions } from './db/schema';
import { log } from './log';
import { formatInTz } from './time';

/**
 * Outgoing webhooks (e.g. a Power Automate "When an HTTP request is
 * received" flow). Disabled unless `WEBHOOK_URL` is set.
 *
 * Delivery is strictly best-effort and must never affect the request that
 * triggered it: `emitEvent` is synchronous, returns nothing, never throws,
 * and does all of its work (lookups, fetch) on a background queue after the
 * caller's transaction has committed. Failures are only logged. There is no
 * retry and no outbox — a missed notification is acceptable, a failed
 * booking is not.
 */

export type WebhookEvent =
	| 'booking.created'
	| 'booking.cancelled'
	| 'session.minimum_reached'
	| 'session.below_minimum'
	| 'session.full'
	| 'preference.created'
	| 'preference.withdrawn'
	| 'webhook.test';

export type BookingSource = 'public' | 'admin';

export interface WebhookEventInput {
	event: Exclude<WebhookEvent, 'webhook.test'>;
	experimentId: string;
	sessionId?: string;
	booking?: { id: string; source: BookingSource };
	preference?: { id: string; kind: string };
	/** Only forwarded when `WEBHOOK_INCLUDE_PII` is on. */
	participant?: { name: string; email: string; manageToken?: string };
}

export interface WebhookResult {
	ok: boolean;
	status?: number;
	error?: string;
}

const TIMEOUT_MS = 10_000;
/** Events beyond this many waiting deliveries are dropped (endpoint down / slow). */
const MAX_PENDING = 100;

let queue: Promise<unknown> = Promise.resolve();
let pending = 0;

export function webhooksEnabled(): boolean {
	return Boolean(WEBHOOK_URL);
}

/** Wait for every queued delivery to settle. Used by tests. */
export function flushWebhooks(): Promise<unknown> {
	return queue;
}

function warn(msg: string, fields: Record<string, unknown>) {
	try {
		log.warn(msg, fields);
	} catch {
		// Logging must not be able to break the caller either.
	}
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Queue an event for delivery. Fire-and-forget: safe to call from any code
 * path, including right after a booking commits.
 */
export function emitEvent(input: WebhookEventInput): void {
	try {
		if (!WEBHOOK_URL) return;
		if (pending >= MAX_PENDING) {
			warn('webhook dropped: queue full', { event: input.event });
			return;
		}
		pending++;
		// Build now so counts reflect the state right after this change. The
		// rejection is handled immediately (resolving to null) so it can never
		// surface as an unhandled rejection while waiting in the queue.
		const payload = buildPayload(input).catch((err) => {
			warn('webhook payload failed', { event: input.event, error: errorMessage(err) });
			return null;
		});
		queue = queue
			.then(async () => {
				const body = await payload;
				if (body) await send(body);
			})
			.catch((err) => warn('webhook delivery failed', { error: errorMessage(err) }))
			.finally(() => pending--);
	} catch (err) {
		warn('webhook emit failed', { event: input.event, error: errorMessage(err) });
	}
}

/** Send a sample event right away and report the outcome (admin "test" button). */
export async function sendTestWebhook(): Promise<WebhookResult> {
	if (!WEBHOOK_URL) return { ok: false, error: 'WEBHOOK_URL is not set' };
	return send(samplePayload());
}

async function send(body: unknown): Promise<WebhookResult> {
	try {
		const res = await fetch(WEBHOOK_URL, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
		// Release the connection; the response body is not used.
		await res.body?.cancel().catch(() => {});
		if (!res.ok) {
			warn('webhook rejected', { status: res.status });
			return { ok: false, status: res.status, error: `HTTP ${res.status}` };
		}
		return { ok: true, status: res.status };
	} catch (err) {
		warn('webhook unreachable', { error: errorMessage(err) });
		return { ok: false, error: errorMessage(err) };
	}
}

function absoluteUrl(path: string): string | null {
	return ORIGIN ? `${ORIGIN.replace(/\/$/, '')}${path}` : null;
}

async function buildPayload(input: WebhookEventInput): Promise<Record<string, unknown>> {
	const [experiment] = await db
		.select({ id: experiments.id, name: experiments.name, slug: experiments.slug })
		.from(experiments)
		.where(eq(experiments.id, input.experimentId));
	if (!experiment) throw new Error(`experiment ${input.experimentId} not found`);

	const payload: Record<string, unknown> = {
		event: input.event,
		occurredAt: new Date().toISOString(),
		experiment: {
			...experiment,
			adminUrl: absoluteUrl(resolve('/(admin)/experiments/[id]', { id: experiment.id }))
		}
	};

	if (input.sessionId) {
		const [session] = await db.select().from(sessions).where(eq(sessions.id, input.sessionId));
		if (session) {
			const [{ n }] = await db
				.select({ n: sql<number>`count(*)` })
				.from(bookings)
				.where(and(eq(bookings.sessionId, session.id), ne(bookings.status, 'cancelled')));
			payload.session = {
				id: session.id,
				startsAt: session.startsAt.toISOString(),
				endsAt: session.endsAt.toISOString(),
				startsAtLocal: formatInTz(session.startsAt),
				location: session.location,
				booked: Number(n),
				minParticipants: session.minParticipants,
				capacity: session.capacity,
				status: session.status,
				adminUrl: absoluteUrl(
					resolve('/(admin)/experiments/[id]/sessions/[sessionId]', {
						id: experiment.id,
						sessionId: session.id
					})
				)
			};
		}
	}

	if (input.booking) payload.booking = input.booking;

	if (input.preference) {
		const [{ n }] = await db
			.select({ n: sql<number>`count(*)` })
			.from(bookingPreferences)
			.where(
				and(
					eq(bookingPreferences.experimentId, experiment.id),
					eq(bookingPreferences.status, 'pending')
				)
			);
		payload.preference = { ...input.preference, pendingCount: Number(n) };
	}

	if (WEBHOOK_INCLUDE_PII && input.participant) {
		const { name, email, manageToken } = input.participant;
		let manageUrl: string | null = null;
		if (manageToken) {
			const params = { slug: experiment.slug, token: manageToken };
			manageUrl = absoluteUrl(
				input.preference
					? resolve('/e/[slug]/preference/[token]', params)
					: resolve('/e/[slug]/booked/[token]', params)
			);
		}
		payload.participant = { name, email, manageUrl };
	}

	return payload;
}

/** Same shape as a real `booking.created` event, filled with example values. */
function samplePayload(): Record<string, unknown> {
	const startsAt = new Date(Date.now() + 86_400_000);
	const endsAt = new Date(startsAt.getTime() + 3_600_000);
	const payload: Record<string, unknown> = {
		event: 'webhook.test',
		occurredAt: new Date().toISOString(),
		experiment: {
			id: 'example-experiment-id',
			name: 'Example experiment',
			slug: 'example',
			adminUrl: absoluteUrl(resolve('/(admin)/experiments'))
		},
		session: {
			id: 'example-session-id',
			startsAt: startsAt.toISOString(),
			endsAt: endsAt.toISOString(),
			startsAtLocal: formatInTz(startsAt),
			location: 'Lab 1',
			booked: 2,
			minParticipants: 3,
			capacity: 5,
			status: 'scheduled',
			adminUrl: absoluteUrl(resolve('/(admin)/experiments'))
		},
		booking: { id: 'example-booking-id', source: 'public' },
		preference: { id: 'example-preference-id', kind: 'recurring', pendingCount: 1 }
	};
	if (WEBHOOK_INCLUDE_PII) {
		payload.participant = {
			name: 'Example Participant',
			email: 'participant@example.org',
			manageUrl: absoluteUrl(resolve('/e/[slug]/booked/[token]', { slug: 'example', token: 'x' }))
		};
	}
	return payload;
}
