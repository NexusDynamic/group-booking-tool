/**
 * Repo-level tests for bookings.ts. Focus: capacity enforcement (serial
 * overflow protection — transactional) and token-by-hash lookup.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';
import { applySchema, clearTables } from './db/test-helpers';

vi.mock('$app/env/private', async (importOriginal) => ({
	...(await importOriginal()),
	...{ DATABASE_URL: ':memory:' }
}));

const client = new Database(':memory:');
const memDb = drizzle(client, { schema });
vi.mock('./db', () => ({ db: memDb }));

const {
	AlreadyBookedError,
	BookingStateError,
	createBooking,
	cancelBookingByToken,
	findBookingByToken,
	PriorAttendanceError,
	SessionFullError,
	setBookingStatus,
	upsertParticipant
} = await import('./bookings');
const { updateSession } = await import('./sessions');
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

function sessionStatus(id: string): string {
	const row = client.prepare('SELECT status FROM sessions WHERE id = ?').get(id) as {
		status: string;
	};
	return row.status;
}

describe('bookings repo', () => {
	it('upserts a participant by normalised email', async () => {
		const a = await upsertParticipant({ email: 'Alice@Example.COM', displayName: 'Alice' });
		const b = await upsertParticipant({ email: 'alice@example.com', displayName: 'Alice B.' });
		expect(a.id).toBe(b.id);
		expect(a.emailNormalised).toBe('alice@example.com');
		// A later (unauthenticated) submission must not rename the participant.
		expect(b.displayName).toBe('Alice');
	});

	it('creates a booking and returns the raw token exactly once', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 2);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { booking, rawToken } = await createBooking({
			experimentId: 'exp-1',
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
				experimentId: 'exp-1',
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
			experimentId: 'exp-1',
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
				experimentId: 'exp-1',
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
			experimentId: 'exp-1',
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
			experimentId: 'exp-1',
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

describe('session status revert on cancellation', () => {
	async function book(sessionId: string, email: string) {
		const p = await upsertParticipant({ email, displayName: email });
		return createBooking({
			experimentId: 'exp-1',
			sessionId,
			participantId: p.id,
			snapshotName: email,
			snapshotEmail: email,
			snapshotFields: {}
		});
	}

	it('reverts session to scheduled when cancellation drops confirmed count below minParticipants', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5, 2); // min=2, capacity=5

		// First booking — session stays 'scheduled' (1 < 2)
		await book('sess-1', 'a@b.test');
		expect(sessionStatus('sess-1')).toBe('scheduled');

		// Second booking — session becomes 'confirmed' (2 >= 2)
		const { rawToken } = await book('sess-1', 'b@b.test');
		expect(sessionStatus('sess-1')).toBe('confirmed');

		// Cancel one — drops to 1 < 2 → must revert to 'scheduled'
		await cancelBookingByToken(rawToken);
		expect(sessionStatus('sess-1')).toBe('scheduled');
	});

	it('keeps session confirmed when cancellation still leaves count at or above minParticipants', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5, 2); // min=2, capacity=5

		await book('sess-1', 'a@b.test');
		await book('sess-1', 'b@b.test'); // → confirmed
		const { rawToken } = await book('sess-1', 'c@b.test'); // 3 confirmed

		await cancelBookingByToken(rawToken); // drops to 2 — still >= min
		expect(sessionStatus('sess-1')).toBe('confirmed');
	});

	it('reverted session accepts new bookings again', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 2, 2); // min=2, capacity=2 (full once both book)

		await book('sess-1', 'a@b.test');
		const { rawToken } = await book('sess-1', 'b@b.test'); // → confirmed + full

		await cancelBookingByToken(rawToken); // → scheduled, 1 seat free
		expect(sessionStatus('sess-1')).toBe('scheduled');

		// New participant can book the freed seat.
		await expect(book('sess-1', 'c@b.test')).resolves.toBeTruthy();
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
			experimentId: 'exp-A',
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

describe('createBooking guards', () => {
	async function book(experimentId: string, sessionId: string, email = 'a@b.test') {
		const p = await upsertParticipant({ email, displayName: email });
		return createBooking({
			experimentId,
			sessionId,
			participantId: p.id,
			snapshotName: email,
			snapshotEmail: email,
			snapshotFields: {}
		});
	}

	it('rejects a session that belongs to a different experiment', async () => {
		seedExperiment('exp-A');
		seedExperiment('exp-B');
		seedSession('sess-B', 'exp-B', 5);

		await expect(book('exp-A', 'sess-B')).rejects.toBeInstanceOf(BookingStateError);
		const count = client.prepare('SELECT COUNT(*) as n FROM bookings').get() as { n: number };
		expect(count.n).toBe(0);
	});

	it('rejects a session that has already started', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);
		client
			.prepare('UPDATE sessions SET starts_at = ? WHERE id = ?')
			.run(Date.now() - 1000, 'sess-1');

		await expect(book('exp-1', 'sess-1')).rejects.toBeInstanceOf(BookingStateError);
	});

	it('rejects a cancelled session', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);
		client.prepare("UPDATE sessions SET status = 'cancelled' WHERE id = ?").run('sess-1');

		await expect(book('exp-1', 'sess-1')).rejects.toBeInstanceOf(BookingStateError);
	});

	it('stays bookable after the minimum is met, until full', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 3, 2); // min=2, capacity=3

		await book('exp-1', 'sess-1', 'a@b.test');
		await book('exp-1', 'sess-1', 'b@b.test');
		expect(sessionStatus('sess-1')).toBe('confirmed');

		await expect(book('exp-1', 'sess-1', 'c@b.test')).resolves.toBeTruthy();
		await expect(book('exp-1', 'sess-1', 'd@b.test')).rejects.toBeInstanceOf(SessionFullError);
	});

	it('rejects a second confirmed booking by the same participant', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);

		const { rawToken } = await book('exp-1', 'sess-1');
		await expect(book('exp-1', 'sess-1')).rejects.toBeInstanceOf(AlreadyBookedError);

		// After cancelling they may book again.
		await cancelBookingByToken(rawToken);
		await expect(book('exp-1', 'sess-1')).resolves.toBeTruthy();
	});

	it('enforces exclude_prior_attendees inside the transaction', async () => {
		seedExperiment(); // exclude_prior_attendees defaults to true
		seedSession('sess-1', 'exp-1', 5);
		seedSession('sess-2', 'exp-1', 5);

		const { booking } = await book('exp-1', 'sess-1');
		await setBookingStatus(booking.id, 'sess-1', 'attended');

		await expect(book('exp-1', 'sess-2')).rejects.toBeInstanceOf(PriorAttendanceError);

		client.prepare('UPDATE experiments SET exclude_prior_attendees = 0').run();
		await expect(book('exp-1', 'sess-2')).resolves.toBeTruthy();
	});
});

describe('token and id scoping', () => {
	it('cancelBookingByToken refuses a token from another experiment', async () => {
		seedExperiment('exp-A');
		seedExperiment('exp-B');
		seedSession('sess-A', 'exp-A', 5);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { rawToken } = await createBooking({
			experimentId: 'exp-A',
			sessionId: 'sess-A',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});

		await expect(cancelBookingByToken(rawToken, 'exp-B')).rejects.toBeInstanceOf(BookingStateError);
		expect((await findBookingByToken(rawToken))?.status).toBe('confirmed');
	});

	it('setBookingStatus ignores a booking id from another session', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5);
		seedSession('sess-2', 'exp-1', 5);
		const p = await upsertParticipant({ email: 'a@b.test', displayName: 'A' });
		const { booking, rawToken } = await createBooking({
			experimentId: 'exp-1',
			sessionId: 'sess-1',
			participantId: p.id,
			snapshotName: 'A',
			snapshotEmail: 'a@b.test',
			snapshotFields: {}
		});

		expect(await setBookingStatus(booking.id, 'sess-2', 'attended')).toBe(false);
		expect((await findBookingByToken(rawToken))?.status).toBe('confirmed');
		expect(await setBookingStatus(booking.id, 'sess-1', 'attended')).toBe(true);
	});
});

describe('session status stays in step with admin changes', () => {
	async function book(email: string) {
		const p = await upsertParticipant({ email, displayName: email });
		return createBooking({
			experimentId: 'exp-1',
			sessionId: 'sess-1',
			participantId: p.id,
			snapshotName: email,
			snapshotEmail: email,
			snapshotFields: {}
		});
	}

	it('marking attendance does not revert a confirmed session', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5, 1);
		const { booking } = await book('a@b.test');
		expect(sessionStatus('sess-1')).toBe('confirmed');

		await setBookingStatus(booking.id, 'sess-1', 'attended');
		expect(sessionStatus('sess-1')).toBe('confirmed');
	});

	it('re-derives status when the minimum is edited', async () => {
		seedExperiment();
		seedSession('sess-1', 'exp-1', 5, 2);
		await book('a@b.test');
		expect(sessionStatus('sess-1')).toBe('scheduled');

		await updateSession('sess-1', 'exp-1', { minParticipants: 1 });
		expect(sessionStatus('sess-1')).toBe('confirmed');

		await updateSession('sess-1', 'exp-1', { minParticipants: 3 });
		expect(sessionStatus('sess-1')).toBe('scheduled');
	});

	it('updateSession is a no-op for a session of another experiment', async () => {
		seedExperiment('exp-1');
		seedExperiment('exp-2');
		seedSession('sess-1', 'exp-1', 5);

		expect(await updateSession('sess-1', 'exp-2', { status: 'cancelled' })).toBe(false);
		expect(sessionStatus('sess-1')).toBe('scheduled');
	});
});
