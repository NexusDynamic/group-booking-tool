import { and, asc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { resolve } from '$app/paths';
import { ORIGIN, WEBHOOK_INCLUDE_PII, WEBHOOK_URL } from '$app/env/private';
import { db } from './db';
import { bookingPreferences, bookings, experiments, sessions } from './db/schema';
import { log } from './log';
import { matchSessionsNow, type BookingPreference } from './preferences';
import { OPEN_SESSION_STATUSES } from './session-status';
import { CLINIC_LOCALE, CLINIC_TZ, formatInTz } from './time';
import { buildSummary, buildTeamsCard } from './webhook-card';

/**
 * Outgoing webhooks (e.g. a Power Automate "When an HTTP request is
 * received" flow). Disabled unless `WEBHOOK_URL` is set.
 *
 * Delivery is strictly best-effort and must never affect the request that
 * triggered it: `emitEvent` is synchronous, returns nothing, never throws,
 * and is called after the caller's transaction has committed. It snapshots
 * the payload synchronously (a few small reads) and sends it on a background
 * queue. Failures are only logged. There is no
 * retry and no outbox — a missed notification is acceptable, a failed
 * booking is not.
 */

export type WebhookEvent =
	| 'booking.created'
	| 'booking.cancelled'
	| 'preference.created'
	| 'preference.withdrawn'
	| 'session.cancelled'
	| 'webhook.test';

export type BookingSource = 'public' | 'admin';

/** Thresholds a booking change crossed, reported on `session.milestones`. */
export type Milestone = 'minimum_reached' | 'full' | 'below_minimum' | 'no_longer_full';

export type SessionState = 'below_minimum' | 'ok' | 'full';

export interface SessionSummary {
	id: string;
	startsAt: string;
	endsAt: string;
	/** Default clinic-locale date and time, e.g. "17. okt. 2026 10.00". */
	startsAtLocal: string;
	/** Short label with weekday, e.g. "fre. 17. okt. 10.00". */
	when: string;
	location: string;
	booked: number;
	minParticipants: number;
	capacity: number;
	/** `booked/capacity`, e.g. "2/6". */
	seats: string;
	state: SessionState;
	status: string;
	/** Pending availability submissions that match this session. */
	waiting: number;
	adminUrl: string | null;
	milestones?: Milestone[];
}

export interface WebhookPayload {
	event: WebhookEvent;
	occurredAt: string;
	/** One-line plain-text description, e.g. for notification previews. */
	summary?: string;
	experiment: { id: string; name: string; slug: string; adminUrl: string | null };
	session?: SessionSummary;
	booking?: { id: string; source: BookingSource };
	preference?: {
		id: string;
		kind: string;
		/** Pending submissions for the experiment, after this change. */
		pendingCount: number;
		/** Human-readable recurring pattern; `recurring` only. */
		pattern?: string;
		windowStart?: string | null;
		windowEnd?: string | null;
		/** Upcoming open sessions the submission covers (at most `PREFERENCE_SESSION_LIMIT`). */
		sessions: SessionSummary[];
		moreCount: number;
	};
	upcoming: SessionSummary[];
	participant?: { name: string; email: string; manageUrl: string | null };
	/** `session.cancelled` with PII on: who was booked and needs telling. */
	affectedParticipants?: Array<{ name: string; email: string }>;
	adaptiveCard?: Record<string, unknown>;
}

export interface WebhookEventInput {
	event: Exclude<WebhookEvent, 'webhook.test'>;
	experimentId: string;
	sessionId?: string;
	milestones?: Milestone[];
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
const UPCOMING_LIMIT = 5;
const PREFERENCE_SESSION_LIMIT = 10;
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
		// Build synchronously, before anything else can run, so counts are an
		// exact snapshot of the state right after this change (better-sqlite3
		// queries are synchronous; this is a handful of small indexed reads).
		let body: WebhookPayload;
		try {
			body = buildPayload(input);
		} catch (err) {
			warn('webhook payload failed', { event: input.event, error: errorMessage(err) });
			return;
		}
		pending++;
		queue = queue
			.then(() => send(body))
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

async function send(body: WebhookPayload): Promise<WebhookResult> {
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

function absoluteUrl(resolved: string): string | null {
	return ORIGIN ? joinUrl(ORIGIN, __BASE_PATH__, resolved) : null;
}

/**
 * Turn a `resolve()` result into an absolute URL. While a request is being
 * handled, `resolve()` returns a path relative to the current page
 * (`paths.relative`), e.g. `../experiments/x`, which loses the base path; so
 * strip that prefix and add the (absolute) `base` back.
 */
export function joinUrl(origin: string, basePath: string, resolved: string): string {
	const path = resolved.startsWith('/')
		? resolved
		: basePath + resolved.replace(/^(?:\.\.?\/)*\.{1,2}(?=\/)/, '');
	return `${origin.replace(/\/$/, '')}${path}`;
}

function sessionAdminUrl(experimentId: string, sessionId: string): string | null {
	return absoluteUrl(
		resolve('/(admin)/experiments/[id]/sessions/[sessionId]', { id: experimentId, sessionId })
	);
}

function sessionState(booked: number, minParticipants: number, capacity: number): SessionState {
	if (booked >= capacity) return 'full';
	return booked >= minParticipants ? 'ok' : 'below_minimum';
}

const SHORT_WHEN: Intl.DateTimeFormatOptions = {
	weekday: 'short',
	day: 'numeric',
	month: 'short',
	hour: '2-digit',
	minute: '2-digit'
};

function describeSession(
	s: {
		id: string;
		experimentId: string;
		startsAt: Date;
		endsAt: Date;
		location: string;
		minParticipants: number;
		capacity: number;
		status: string;
	},
	booked: number,
	waiting: number
): SessionSummary {
	return {
		id: s.id,
		startsAt: s.startsAt.toISOString(),
		endsAt: s.endsAt.toISOString(),
		startsAtLocal: formatInTz(s.startsAt),
		when: formatInTz(s.startsAt, CLINIC_TZ, SHORT_WHEN),
		location: s.location,
		booked,
		minParticipants: s.minParticipants,
		capacity: s.capacity,
		seats: `${booked}/${s.capacity}`,
		state: sessionState(booked, s.minParticipants, s.capacity),
		status: s.status,
		waiting,
		adminUrl: sessionAdminUrl(s.experimentId, s.id)
	};
}

/** "Mondays and Wednesdays 09:00–11:00, 1. jun. 2026 – 30. jun. 2026" */
function describePattern(pref: BookingPreference): string | undefined {
	if (!pref.rrule || !pref.dtstartLocal) return undefined;
	const byDay = /BYDAY=([A-Z,]+)/i.exec(pref.rrule)?.[1]?.split(',') ?? [];
	// 2024-01-01 was a Monday; used only to name weekdays in the clinic locale.
	const order = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
	const weekday = new Intl.DateTimeFormat(CLINIC_LOCALE, { weekday: 'long', timeZone: 'UTC' });
	const days = byDay
		.map((d) => order.indexOf(d.toUpperCase()))
		.filter((i) => i >= 0)
		.map((i) => weekday.format(new Date(Date.UTC(2024, 0, 1 + i))));
	const start = pref.dtstartLocal.slice(11, 16);
	let time = start;
	if (pref.durationMinutes) {
		const [h, m] = start.split(':').map(Number);
		const end = (h * 60 + m + pref.durationMinutes) % (24 * 60);
		time += `–${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`;
	}
	const dateOnly: Intl.DateTimeFormatOptions = { dateStyle: 'medium' };
	const from = pref.windowStart ? formatInTz(pref.windowStart, CLINIC_TZ, dateOnly) : '';
	const to = pref.windowEnd ? formatInTz(pref.windowEnd, CLINIC_TZ, dateOnly) : '';
	const window = from || to ? `, ${from || '…'} – ${to || '…'}` : '';
	return `${days.join(', ') || 'Weekly'} ${time}${window}`;
}

/** Non-cancelled bookings per session, in one query. */
function bookedCounts(ids: string[]): Map<string, number> {
	if (ids.length === 0) return new Map();
	const rows = db
		.select({ sessionId: bookings.sessionId, n: sql<number>`count(*)` })
		.from(bookings)
		.where(and(inArray(bookings.sessionId, ids), ne(bookings.status, 'cancelled')))
		.groupBy(bookings.sessionId)
		.all();
	return new Map(rows.map((r) => [r.sessionId, Number(r.n)]));
}

function buildPayload(input: WebhookEventInput): WebhookPayload {
	const experiment = db
		.select({ id: experiments.id, name: experiments.name, slug: experiments.slug })
		.from(experiments)
		.where(eq(experiments.id, input.experimentId))
		.get();
	if (!experiment) throw new Error(`experiment ${input.experimentId} not found`);

	// Pending submissions, and how many of them match each session.
	const pending = db
		.select()
		.from(bookingPreferences)
		.where(
			and(
				eq(bookingPreferences.experimentId, experiment.id),
				eq(bookingPreferences.status, 'pending')
			)
		)
		.all();
	const waiting = new Map<string, number>();
	for (const pref of pending) {
		for (const s of matchSessionsNow(pref)) {
			waiting.set(s.id, (waiting.get(s.id) ?? 0) + 1);
		}
	}

	const upcomingRows = db
		.select()
		.from(sessions)
		.where(
			and(
				eq(sessions.experimentId, experiment.id),
				gte(sessions.startsAt, new Date()),
				inArray(sessions.status, [...OPEN_SESSION_STATUSES])
			)
		)
		.orderBy(asc(sessions.startsAt))
		.limit(UPCOMING_LIMIT)
		.all();

	const session = input.sessionId
		? db.select().from(sessions).where(eq(sessions.id, input.sessionId)).get()
		: undefined;

	let pref: BookingPreference | undefined;
	let prefSessions: (typeof sessions.$inferSelect)[] = [];
	let prefMore = 0;
	if (input.preference) {
		pref = db
			.select()
			.from(bookingPreferences)
			.where(eq(bookingPreferences.id, input.preference.id))
			.get();
		if (pref) {
			const matched = matchSessionsNow(pref);
			prefMore = Math.max(0, matched.length - PREFERENCE_SESSION_LIMIT);
			const ids = matched.slice(0, PREFERENCE_SESSION_LIMIT).map((m) => m.id);
			if (ids.length > 0) {
				prefSessions = db
					.select()
					.from(sessions)
					.where(inArray(sessions.id, ids))
					.orderBy(asc(sessions.startsAt))
					.all();
			}
		}
	}

	const counts = bookedCounts([
		...new Set([...upcomingRows, ...prefSessions, ...(session ? [session] : [])].map((s) => s.id))
	]);
	const describe = (s: typeof sessions.$inferSelect) =>
		describeSession(s, counts.get(s.id) ?? 0, waiting.get(s.id) ?? 0);

	const payload: WebhookPayload = {
		event: input.event,
		occurredAt: new Date().toISOString(),
		experiment: {
			...experiment,
			adminUrl: absoluteUrl(resolve('/(admin)/experiments/[id]', { id: experiment.id }))
		},
		upcoming: upcomingRows.map(describe)
	};

	if (session) {
		payload.session = { ...describe(session), milestones: input.milestones ?? [] };
	}

	if (input.booking) payload.booking = input.booking;

	if (input.preference) {
		payload.preference = {
			...input.preference,
			pendingCount: pending.length,
			...(pref?.kind === 'recurring'
				? {
						pattern: describePattern(pref),
						windowStart: pref.windowStart?.toISOString() ?? null,
						windowEnd: pref.windowEnd?.toISOString() ?? null
					}
				: {}),
			sessions: prefSessions.map(describe),
			moreCount: prefMore
		};
	}

	if (WEBHOOK_INCLUDE_PII && input.event === 'session.cancelled' && session) {
		payload.affectedParticipants = db
			.select({ name: bookings.snapshotName, email: bookings.snapshotEmail })
			.from(bookings)
			.where(and(eq(bookings.sessionId, session.id), ne(bookings.status, 'cancelled')))
			.orderBy(asc(bookings.createdAt))
			.all();
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

	return withPresentation(payload);
}

function withPresentation(payload: WebhookPayload): WebhookPayload {
	return { ...payload, summary: buildSummary(payload), adaptiveCard: buildTeamsCard(payload) };
}

/** Same shape as a real event, filled with example values. */
function samplePayload(): WebhookPayload {
	const exampleUrl = absoluteUrl(resolve('/(admin)/experiments'));
	const sample = (
		id: string,
		daysAhead: number,
		booked: number,
		extra: Partial<SessionSummary> = {}
	): SessionSummary => {
		const startsAt = new Date(Date.now() + daysAhead * 86_400_000);
		const endsAt = new Date(startsAt.getTime() + 3_600_000);
		return {
			id,
			startsAt: startsAt.toISOString(),
			endsAt: endsAt.toISOString(),
			startsAtLocal: formatInTz(startsAt),
			when: formatInTz(startsAt, CLINIC_TZ, SHORT_WHEN),
			location: 'Lab 1',
			booked,
			minParticipants: 3,
			capacity: 5,
			seats: `${booked}/5`,
			state: sessionState(booked, 3, 5),
			status: booked >= 3 ? 'confirmed' : 'scheduled',
			waiting: 0,
			adminUrl: exampleUrl,
			...extra
		};
	};
	const current = sample('example-session-id', 1, 3, { milestones: ['minimum_reached'] });
	const payload: WebhookPayload = {
		event: 'webhook.test',
		occurredAt: new Date().toISOString(),
		experiment: {
			id: 'example-experiment-id',
			name: 'Example experiment',
			slug: 'example',
			adminUrl: exampleUrl
		},
		session: current,
		booking: { id: 'example-booking-id', source: 'public' },
		preference: {
			id: 'example-preference-id',
			kind: 'session_list',
			pendingCount: 1,
			sessions: [sample('example-session-2', 3, 1, { waiting: 1 })],
			moreCount: 0
		},
		upcoming: [
			{ ...current, milestones: undefined },
			sample('example-session-2', 3, 1, { waiting: 1 }),
			sample('example-session-3', 5, 5)
		]
	};
	if (WEBHOOK_INCLUDE_PII) {
		payload.participant = {
			name: 'Example Participant',
			email: 'participant@example.org',
			manageUrl: absoluteUrl(resolve('/e/[slug]/booked/[token]', { slug: 'example', token: 'x' }))
		};
	}
	return withPresentation(payload);
}
