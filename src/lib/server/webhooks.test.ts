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
const {
	assignPreferenceToSessions,
	createRecurringPreference,
	createSessionListPreference,
	withdrawPreferenceByToken
} = await import('./preferences');
const { cancelSession } = await import('./sessions');
const { emitEvent, flushWebhooks, joinUrl, sendTestWebhook } = await import('./webhooks');

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

function seedSession(
	id: string,
	experimentId: string,
	capacity: number,
	minParticipants = 1,
	{ startsAt = Date.now() + 86_400_000, status = 'scheduled' } = {}
) {
	client
		.prepare(
			'INSERT INTO sessions (id, experiment_id, starts_at, ends_at, capacity, min_participants, status, public_ics_token) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
		)
		.run(
			id,
			experimentId,
			startsAt,
			startsAt + 3_600_000,
			capacity,
			minParticipants,
			status,
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
			session: {
				id: 's1',
				booked: 1,
				minParticipants: 2,
				capacity: 3,
				seats: '1/3',
				state: 'below_minimum',
				status: 'scheduled',
				milestones: [],
				adminUrl: 'https://booking.example.org/experiments/exp-1/sessions/s1'
			},
			booking: { id: booking.id, source: 'public' },
			upcoming: [{ id: 's1', seats: '1/3' }]
		});
		expect(event).not.toHaveProperty('participant');
		expect(event.summary).toMatch(/^New booking · Fun Experiment · .+ \(1\/3\)$/);
		expect(event.adaptiveCard).toMatchObject({ type: 'AdaptiveCard', version: '1.4' });
		expect(JSON.stringify(event.adaptiveCard)).not.toContain('a@x.com');
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

	it('reports milestones on a single event per booking change', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 2, 2);
		await book('s1', 'a@x.com');
		const { rawToken } = await book('s1', 'b@x.com');
		await cancelBookingByToken(rawToken);

		const events = await sent();
		expect(events.map((e) => [e.event, e.session.seats, e.session.milestones])).toEqual([
			['booking.created', '1/2', []],
			['booking.created', '2/2', ['minimum_reached', 'full']],
			['booking.cancelled', '1/2', ['below_minimum', 'no_longer_full']]
		]);
		expect(events[1].session.state).toBe('full');
		expect(JSON.stringify(events[1].adaptiveCard)).toContain('Minimum reached');
	});

	it('lists the next 5 open upcoming sessions in order, with counts and waiting', async () => {
		seedExperiment();
		const day = 86_400_000;
		seedSession('past', 'exp-1', 3, 1, { startsAt: Date.now() - day });
		seedSession('gone', 'exp-1', 3, 1, { startsAt: Date.now() + day, status: 'cancelled' });
		for (let i = 7; i >= 1; i--) {
			seedSession(`s${i}`, 'exp-1', 4, 2, { startsAt: Date.now() + i * day });
		}
		await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'Pat',
			email: 'pat@x.com',
			sessionIds: ['s2', 's3'],
			notes: ''
		});
		await book('s1', 'a@x.com');

		const event = (await sent()).at(-1)!;
		expect(event.upcoming.map((s: { id: string }) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5']);
		expect(event.upcoming[0]).toMatchObject({ seats: '1/4', state: 'below_minimum', waiting: 0 });
		expect(event.upcoming[1]).toMatchObject({ seats: '0/4', waiting: 1 });
	});

	it('does not re-send when an already-cancelled booking is cancelled again', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 3, 2);
		const { rawToken } = await book('s1', 'a@x.com');
		await cancelBookingByToken(rawToken);
		await cancelBookingByToken(rawToken);
		expect((await sent()).map((e) => e.event)).toEqual(['booking.created', 'booking.cancelled']);
	});

	it('reports session.cancelled once, with who was booked only when PII is enabled', async () => {
		seedExperiment();
		seedSession('s1', 'exp-1', 4, 2);
		seedSession('s2', 'exp-1', 4, 2, { startsAt: Date.now() + 2 * 86_400_000 });
		await book('s1', 'a@x.com');
		const { rawToken } = await book('s1', 'b@x.com');
		await cancelBookingByToken(rawToken);
		await flushWebhooks();
		fetchMock.mockClear();

		expect(await cancelSession('s1', 'exp-1')).toBe(true);
		expect(await cancelSession('s1', 'exp-1')).toBe(true); // already cancelled: no event
		expect(await cancelSession('s1', 'exp-other')).toBe(false);

		const events = await sent();
		expect(events).toHaveLength(1);
		expect(events[0]).toMatchObject({
			event: 'session.cancelled',
			session: { id: 's1', status: 'cancelled', booked: 1 }
		});
		expect(events[0]).not.toHaveProperty('affectedParticipants');
		// The cancelled session drops out of the upcoming list.
		expect(events[0].upcoming.map((u: { id: string }) => u.id)).toEqual(['s2']);
		const card = JSON.stringify(events[0].adaptiveCard);
		expect(card).toContain('Session cancelled');
		expect(card).toContain('1 participant was booked');
		expect(card).not.toContain('a@x.com');

		env.WEBHOOK_INCLUDE_PII = true;
		await flushWebhooks();
		fetchMock.mockClear();
		await cancelSession('s2', 'exp-1');
		expect((await sent())[0].affectedParticipants).toEqual([]);
	});

	it('lists affected participants on session.cancelled when PII is enabled', async () => {
		env.WEBHOOK_INCLUDE_PII = true;
		seedExperiment();
		seedSession('s1', 'exp-1', 4, 2);
		await book('s1', 'a@x.com');
		await book('s1', 'b@x.com');
		await flushWebhooks();
		fetchMock.mockClear();
		await cancelSession('s1', 'exp-1');

		const [event] = await sent();
		expect(event.affectedParticipants).toEqual([
			{ name: 'Name a@x.com', email: 'a@x.com' },
			{ name: 'Name b@x.com', email: 'b@x.com' }
		]);
		expect(JSON.stringify(event.adaptiveCard)).toContain('b@x.com');
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
		expect(events[0].preference).toMatchObject({
			id: preference.id,
			kind: 'session_list',
			pendingCount: 1,
			sessions: [{ id: 's1', seats: '0/3', state: 'below_minimum' }],
			moreCount: 0
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

	it('describes a recurring preference with its pattern and matching sessions', async () => {
		seedExperiment();
		// Next Monday 09:00 Copenhagen, and the Monday after; a Tuesday that should not match.
		const { localToUtc } = await import('./time');
		const monday = new Date();
		monday.setUTCDate(monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7));
		const ymd = monday.toISOString().slice(0, 10);
		const at = (daysLater: number) => {
			const d = new Date(`${ymd}T00:00Z`);
			d.setUTCDate(d.getUTCDate() + daysLater);
			// Wall-clock 09:00 in the clinic timezone, so DST changes don't shift it.
			return localToUtc(`${d.toISOString().slice(0, 10)}T09:00`).getTime();
		};
		seedSession('mon1', 'exp-1', 4, 2, { startsAt: at(0) });
		seedSession('mon2', 'exp-1', 4, 2, { startsAt: at(7) });
		seedSession('tue', 'exp-1', 4, 2, { startsAt: at(1) });

		await createRecurringPreference({
			experimentId: 'exp-1',
			name: 'Pat',
			email: 'pat@x.com',
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			dtstartLocal: `${ymd}T09:00`,
			durationMinutes: 60,
			notes: ''
		});

		const [event] = await sent();
		expect(event.preference.kind).toBe('recurring');
		expect(event.preference.pattern).toMatch(/09:00–10:00/);
		expect(event.preference.sessions.map((s: { id: string }) => s.id)).toEqual(['mon1', 'mon2']);
		expect(event.summary).toContain(event.preference.pattern);
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

	describe('joinUrl', () => {
		it.each([
			// resolve() outside a request: already absolute, base included
			['/booking/experiments/x', 'https://u.dk/booking/experiments/x'],
			// resolve() during a request (paths.relative): relative to the current page
			['./experiments/x', 'https://u.dk/booking/experiments/x'],
			['../experiments/x', 'https://u.dk/booking/experiments/x'],
			['../../experiments/x/sessions/s', 'https://u.dk/booking/experiments/x/sessions/s']
		])('%s', (resolved, expected) => {
			expect(joinUrl('https://u.dk/', '/booking', resolved)).toBe(expected);
		});

		it('works without a base path', () => {
			expect(joinUrl('https://u.dk', '', './e/fun/booked/t')).toBe('https://u.dk/e/fun/booked/t');
		});
	});

	describe('sendTestWebhook', () => {
		it('reports success', async () => {
			expect(await sendTestWebhook()).toEqual({ ok: true, status: 202 });
			const body = JSON.parse(fetchMock.mock.calls[0][1].body);
			expect(body.event).toBe('webhook.test');
			expect(body).not.toHaveProperty('participant');
			expect(body.upcoming.length).toBeGreaterThan(0);
			expect(body.adaptiveCard).toMatchObject({ type: 'AdaptiveCard', version: '1.4' });
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
