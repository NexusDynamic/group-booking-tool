/**
 * Repo-level tests for bookings.ts. Focus: capacity enforcement (serial
 * overflow protection — transactional) and token-by-hash lookup.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { applySchema, clearTables } from './db/test-helpers';

vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: ':memory:' } }));

const client = new Database(':memory:');
const memDb = drizzle(client, { schema });
vi.mock('./db', () => ({ db: memDb }));

const {
	createBooking,
	cancelBookingByToken,
	findBookingByToken,
	SessionFullError,
	upsertParticipant
} = await import('./bookings');
const { hashToken } = await import('./tokens');
const { hasPriorAttendance } = await import('./exclusions');

beforeAll(async () => applySchema(client));
afterAll(() => client.close());
beforeEach(() => clearTables(client));

function seedExperiment(id = 'exp-1') {
	client
		.prepare(
			'INSERT INTO experiments (id, slug, name, duration_minutes, public_ics_token, researcher_ics_token) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(id, `slug-${id}`, 'Exp', 60, `pub-${id}`, `res-${id}`);
}

function seedSession(id: string, experimentId: string, capacity: number) {
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
			1,
			`pub-${id}`
		);
}

describe('bookings repo', () => {
	it('upserts a participant by normalised email', async () => {
		const a = await upsertParticipant({ email: 'Alice@Example.COM', displayName: 'Alice' });
		const b = await upsertParticipant({ email: 'alice@example.com', displayName: 'Alice B.' });
		expect(a.id).toBe(b.id);
		expect(a.emailNormalised).toBe('alice@example.com');
	});

	it('creates a booking and returns the raw token exactly once', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 2);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { booking, rawToken } = await createBooking({
			sessionId: 'sess-1',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});
		expect(rawToken).toHaveLength(43); // base64url of 32 bytes
		expect(booking.manageTokenHash).toBe(hashToken(rawToken));
		// Raw token must not be stored.
		const row = client
			.prepare('SELECT manage_token_hash FROM bookings WHERE id = ?')
			.get(booking.id) as { manage_token_hash: string };
		expect(row.manage_token_hash).not.toBe(rawToken);
	});

	it('enforces capacity: the (N+1)th booking throws SessionFullError', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 2);

		const mk = async (email: string) => {
			const p = await upsertParticipant({ email, displayName: email });
			return createBooking({
				sessionId: 'sess-1',
				participantId: p.id,
				snapshotName: email,
				snapshotEmail: email,
				snapshotFields: {}
			});
		};

		await mk('a@b.test');
		await mk('b@b.test');
		await expect(mk('c@b.test')).rejects.toBeInstanceOf(SessionFullError);

		const count = client.prepare('SELECT COUNT(*) as n FROM bookings').get() as { n: number };
		expect(count.n).toBe(2);
	});

	it('cancelled bookings do not count against capacity', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 1);
		const p1 = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const res = await createBooking({
			sessionId: 'sess-1',
			participantId: p1.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});
		await cancelBookingByToken(res.rawToken);

		// Another participant should now be able to book.
		const p2 = await upsertParticipant({ email: 'b@b.test', displayName: 'B' });
		await expect(
			createBooking({
				sessionId: 'sess-1',
				participantId: p2.id,
				snapshotName: 'B',
				snapshotEmail: 'b@b.test',
				snapshotFields: {}
			})
		).resolves.toBeTruthy();
	});

	it('looks up a booking by its raw token via the hash', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { rawToken, booking } = await createBooking({
			sessionId: 'sess-1',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});
		const found = await findBookingByToken(rawToken);
		expect(found?.id).toBe(booking.id);
		// Wrong token returns undefined.
		expect(await findBookingByToken('nope')).toBeUndefined();
	});

	it('cancelBookingByToken is idempotent', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { rawToken } = await createBooking({
			sessionId: 'sess-1',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});
		const first = await cancelBookingByToken(rawToken);
		expect(first.status).toBe('cancelled');
		const second = await cancelBookingByToken(rawToken);
		expect(second.status).toBe('cancelled');
	});
});

describe('exclusions.hasPriorAttendance', () => {
	it('blocks rebooking after attended on the same experiment, but not others', async () => {
		seedExperiment('exp-A');
		seedExperiment('exp-B');
		seedSession('sess-A', 'exp-A', 5);
		seedSession('sess-B', 'exp-B', 5);

		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { booking } = await createBooking({
			sessionId: 'sess-A',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});
		// Mark attended directly.
		client.prepare('UPDATE bookings SET status = ? WHERE id = ?').run('attended', booking.id);

		expect(await hasPriorAttendance(p.id, 'exp-A')).toBe(true);
		expect(await hasPriorAttendance(p.id, 'exp-B')).toBe(false);
	});
});
