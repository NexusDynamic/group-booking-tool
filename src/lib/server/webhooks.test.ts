/**
 * Webhook delivery: which events fire, what they carry, and — most
 * importantly — that a failing or unreachable endpoint never affects the
 * booking flow.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { applySchema, clearTables } from './db/test-helpers';

const env = vi.hoisted(() => ({
	WEBHOOK_URL: 'https://hook.example.test/flow?sig=secret',
	WEBHOOK_INCLUDE_PII: false,
	ORIGIN: 'https://booking.example.org'
}));
vi.mock('$app/env/private', async (importOriginal) => {
	const original = await importOriginal<Record<string, unknown>>();
	return {
		...original,
		DATABASE_URL: ':memory:',
		CLINIC_TZ: 'Europe/Copenhagen',
		CLINIC_LOCALE: 'da-DK',
		get WEBHOOK_URL() {
			return env.WEBHOOK_URL;
		},
		get WEBHOOK_INCLUDE_PII() {
			return env.WEBHOOK_INCLUDE_PII;
		},
		get ORIGIN() {
			return env.ORIGIN;
		}
	};
});

const client = new Database(':memory:');
const memDb = drizzle(client, { schema });
vi.mock('./db', () => ({ db: memDb }));

const warn = vi.hoisted(() => vi.fn());
vi.mock('./log', () => ({
	log: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() }
}));

const { createBooking, cancelBookingByToken, upsertParticipant } = await import('./bookings');
const { assignPreferenceToSessions, createSessionListPreference, withdrawPreferenceByToken } =
	await import('./preferences');
const { emitEvent, flushWebhooks, sendTestWebhook } = await import('./webhooks');

const fetchMock = vi.fn();

beforeAll(async () => applySchema(client));
afterAll(() => {
	client.close();
	vi.unstubAllGlobals();
});
beforeEach(() => {
	clearTables(client);
	env.WEBHOOK_URL = 'https://hook.example.test/flow?sig=secret';
	env.WEBHOOK_INCLUDE_PII = false;
	warn.mockReset();
	fetchMock.mockReset();
	fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
	vi.stubGlobal('fetch', fetchMock);
});

function seedExperiment(id = 'exp-1') {
	client
		.prepare(
			'INSERT INTO experiments (id, slug, name, duration_minutes, public_ics_token, researcher_ics_token) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(id, `slug-${id}`, 'Fun Experiment', 60, `pub-${id}`, `res-${id}`);
}

function seedSession(id: string, experimentId: string, capacity: number, minParticipants = 1) {
	client
		.prepare(
			'INSERT INTO sessions (id, experiment_id, starts_at, ends_at, capacity, min_participants, public_ics_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			id,
			experimentId,
			Date.now() + 86_400_000,
			Date.now() + 86_400_000 + 3_600_000,
			capacity,
			minParticipants,
			`pub-${id}`
		);
}

async function book(sessionId: string, email: string) {
	const p = await upsertParticipant({ email, displayName: email });
	return createBooking({
		experimentId: 'exp-1',
		sessionId,
		participantId: p.id,
		snapshotName: `Name ${email}`,
		snapshotEmail: email,
		snapshotFields: {}
	});
}

/** Bodies of every delivered webhook, in order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- free-form JSON assertions
async function sent(): Promise<Array<Record<string, any>>> {
	await flushWebhooks();
	return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body));
}

describe('webhooks', () => {
	it('sends nothing when WEBHOOK_URL is unset', async () => {
		env.WEBHOOK_URL = '';
		seedExperiment();
		seedSession('s1', 'exp-1', 3);
		await book('s1', 'a@x.com');
		expect(await sent()).toEqual([]);
	});

	it('reports booking.created with session counts and no participant data by default', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 3, 2);
		const { booking } = await book('s1', 'a@x.com');

		const [event] = await sent();
		expect(fetchMock.mock.calls[0][0]).toBe(env.WEBHOOK_URL);
		expect(event).toMatchObject({
			event: 'booking.created',
			experiment: {
				id: 'exp-1',
				name: 'Fun Experiment',
				adminUrl: 'https://booking.example.org/experiments/exp-1'
			},
			session: { id: 's1', booked: 1, minParticipants: 2, capacity: 3, status: 'scheduled' },
			booking: { id: booking.id, source: 'public' }
		});
		expect(event).not.toHaveProperty('participant');
	});

	it('includes participant details and a working manage link when PII is enabled', async () => {
		env.WEBHOOK_INCLUDE_PII = true;
		seedExperiment();
		seedSession('s1', 'exp-1', 3);
		const { rawToken } = await book('s1', 'a@x.com');

		const [event] = await sent();
		expect(event.participant).toEqual({
			name: 'Name a@x.com',
			email: 'a@x.com',
			manageUrl: `https://booking.example.org/e/slug-exp-1/booked/${rawToken}`
		});
	});

	it('reports when a session reaches its minimum, fills up, and drops below minimum', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 2, 2);
		await book('s1', 'a@x.com');
		const { rawToken } = await book('s1', 'b@x.com');
		await cancelBookingByToken(rawToken);

		expect((await sent()).map((e) => e.event)).toEqual([
			'booking.created',
			'booking.created',
			'session.minimum_reached',
			'session.full',
			'booking.cancelled',
			'session.below_minimum'
		]);
	});

	it('does not re-send when an already-cancelled booking is cancelled again', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 3, 2);
		const { rawToken } = await book('s1', 'a@x.com');
		await cancelBookingByToken(rawToken);
		await cancelBookingByToken(rawToken);
		expect((await sent()).map((e) => e.event)).toEqual(['booking.created', 'booking.cancelled']);
	});

	it('reports preference create / withdraw with the pending count, and admin assignment', async () => {
		env.WEBHOOK_INCLUDE_PII = true;
		seedExperiment();
		seedSession('s1', 'exp-1', 3, 2);
		const { preference, rawToken } = await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'Pat',
			email: 'pat@x.com',
			sessionIds: ['s1'],
			notes: ''
		});
		await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'Sam',
			email: 'sam@x.com',
			sessionIds: ['s1'],
			notes: ''
		});
		await assignPreferenceToSessions(preference.id, ['s1']);
		await withdrawPreferenceByToken(rawToken); // already assigned: no event

		const events = await sent();
		expect(events.map((e) => e.event)).toEqual([
			'preference.created',
			'preference.created',
			'booking.created'
		]);
		expect(events[0].preference).toEqual({
			id: preference.id,
			kind: 'session_list',
			pendingCount: 1
		});
		expect(events[0].participant.manageUrl).toBe(
			`https://booking.example.org/e/slug-exp-1/preference/${rawToken}`
		);
		expect(events[1].preference.pendingCount).toBe(2);
		expect(events[2].booking.source).toBe('admin');
	});

	it('reports preference.withdrawn', async () => {
		seedExperiment();
		const { rawToken } = await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'Pat',
			email: 'pat@x.com',
			sessionIds: [],
			notes: ''
		});
		await withdrawPreferenceByToken(rawToken);
		const events = await sent();
		expect(events.map((e) => e.event)).toEqual(['preference.created', 'preference.withdrawn']);
		expect(events[1].preference.pendingCount).toBe(0);
	});

	describe('never interferes with booking', () => {
		it('when the endpoint is unreachable', async () => {
			fetchMock.mockRejectedValue(new TypeError('fetch failed'));
			seedExperiment();
			seedSession('s1', 'exp-1', 3);
			await expect(book('s1', 'a@x.com')).resolves.toHaveProperty('rawToken');
			await flushWebhooks();
			expect(warn).toHaveBeenCalledWith('webhook unreachable', { error: 'fetch failed' });
		});

		it('when the endpoint returns an error status', async () => {
			fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
			seedExperiment();
			seedSession('s1', 'exp-1', 3);
			await expect(book('s1', 'a@x.com')).resolves.toHaveProperty('rawToken');
			await flushWebhooks();
			expect(warn).toHaveBeenCalledWith('webhook rejected', { status: 500 });
		});

		it('when fetch throws synchronously', async () => {
			fetchMock.mockImplementation(() => {
				throw new Error('boom');
			});
			seedExperiment();
			seedSession('s1', 'exp-1', 3);
			await expect(book('s1', 'a@x.com')).resolves.toHaveProperty('rawToken');
			await flushWebhooks();
			expect(warn).toHaveBeenCalled();
		});

		it('when the endpoint hangs: booking returns before delivery finishes', async () => {
			let release!: (r: Response) => void;
			fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)));
			seedExperiment();
			seedSession('s1', 'exp-1', 3);
			// Would time out if the booking awaited delivery.
			await expect(book('s1', 'a@x.com')).resolves.toHaveProperty('rawToken');
			await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
			release(new Response(null, { status: 202 }));
			await flushWebhooks();
		});

		it('when building the payload fails', async () => {
			emitEvent({ event: 'booking.created', experimentId: 'does-not-exist' });
			await flushWebhooks();
			expect(fetchMock).not.toHaveBeenCalled();
			expect(warn).toHaveBeenCalledWith(
				'webhook payload failed',
				expect.objectContaining({ event: 'booking.created' })
			);
		});
	});

	describe('sendTestWebhook', () => {
		it('reports success', async () => {
			expect(await sendTestWebhook()).toEqual({ ok: true, status: 202 });
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.event).toBe('webhook.test');
			expect(body).not.toHaveProperty('participant');
		});

		it('reports failure without throwing', async () => {
			fetchMock.mockRejectedValue(new TypeError('fetch failed'));
			expect(await sendTestWebhook()).toEqual({ ok: false, error: 'fetch failed' });
		});

		it('includes an example participant when PII is enabled', async () => {
			env.WEBHOOK_INCLUDE_PII = true;
			await sendTestWebhook();
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.participant.email).toBe('participant@example.org');
		});
	});
});
