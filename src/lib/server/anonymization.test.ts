/**
 * Comprehensive tests for anonymization.ts.
 *
 * The module takes a `db` instance as a parameter so no vi.mock('./db') is
 * needed — we create a fresh in-memory database per test suite via createTestDb
 * and pass it directly.
 *
 * Coverage:
 *   runAnonymizationJob
 *     - returns zero counts when the database is empty
 *     - does not anonymise bookings before the retention window
 *     - anonymises bookings once (session.endsAt + retentionDays) has passed
 *     - uses per-experiment dataRetentionDays, falling back to the default
 *     - anonymises booking preferences using windowEnd when set
 *     - anonymises booking preferences using updatedAt when windowEnd is absent
 *     - anonymises the participant row once all their bookings and preferences
 *       are anonymised
 *     - does NOT anonymise a participant while any booking is still live
 *     - does NOT anonymise a participant while any preference is still live
 *     - handles participants with a mix of anonymised and live records correctly
 *     - cleans up expired better-auth sessions
 *     - leaves non-expired better-auth sessions untouched
 *     - is idempotent (running twice does not double-count or corrupt data)
 *     - assigns unique '<anonymized:{id}>' email to each participant, preserving
 *       the unique index
 *     - ghost participants (no bookings, no prefs) cleaned up after default
 *       retention window from createdAt
 *     - returns accurate counts
 *
 *   forceAnonymiseParticipant
 *     - immediately anonymises all bookings for the target participant
 *     - immediately anonymises all preferences for the target participant
 *     - immediately anonymises the participant record
 *     - does not touch other participants
 *     - is idempotent — already-anonymised rows are not double-processed
 *     - correctly handles a participant with no bookings or preferences
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb, clearTables } from './db/test-helpers';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import type * as schema from './db/schema';

vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: ':memory:' } }));

const { runAnonymizationJob, forceAnonymiseParticipant } = await import('./anonymization');

// ---------------------------------------------------------------------------
// Shared in-memory database (recreated once; cleared between tests)
// ---------------------------------------------------------------------------
let client: Database.Database;
let db: BetterSQLite3Database<typeof schema>;

beforeAll(async () => {
	({ client, db } = await createTestDb());
});
afterAll(() => client?.close());
beforeEach(() => clearTables(client));

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
const DEFAULT_RETENTION = 90; // days

/** Insert a minimal experiment row. */
function seedExperiment(id: string, retentionDays: number | null = null) {
	client
		.prepare(
			`INSERT INTO experiments
				(id, slug, name, duration_minutes, public_ics_token, researcher_ics_token,
				 data_retention_days)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, id, id, 60, `pub-${id}`, `res-${id}`, retentionDays);
}

/**
 * Insert a session row.
 * @param endsAtOffset  Milliseconds relative to Date.now().
 *   Negative → already ended; positive → in the future.
 */
function seedSession(id: string, experimentId: string, endsAtOffset: number) {
	const endsAt = Date.now() + endsAtOffset;
	const startsAt = endsAt - 3_600_000; // 1 hour before endsAt
	client
		.prepare(
			`INSERT INTO sessions
				(id, experiment_id, starts_at, ends_at, capacity, min_participants, public_ics_token)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, experimentId, startsAt, endsAt, 10, 1, `pub-${id}`);
}

/** Insert a participant row. */
function seedParticipant(id: string, email = `${id}@test.example`) {
	client.prepare('INSERT INTO participants (id, email_normalised) VALUES (?, ?)').run(id, email);
}

/** Insert a booking row (status defaults to 'confirmed'). */
function seedBooking(
	id: string,
	sessionId: string,
	participantId: string,
	overrides: { status?: string } = {}
) {
	client
		.prepare(
			`INSERT INTO bookings
				(id, session_id, participant_id, snapshot_name, snapshot_email, manage_token_hash, status)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(
			id,
			sessionId,
			participantId,
			'Test Name',
			'test@example.test',
			`hash-${id}`,
			overrides.status ?? 'confirmed'
		);
}

/**
 * Insert a booking_preferences row.
 * @param windowEndOffset  If provided, sets window_end relative to Date.now().
 */
function seedPreference(
	id: string,
	experimentId: string,
	participantId: string,
	windowEndOffset?: number
) {
	const windowEnd = windowEndOffset != null ? Date.now() + windowEndOffset : null;
	client
		.prepare(
			`INSERT INTO booking_preferences
				(id, experiment_id, participant_id, snapshot_name, snapshot_email,
				 kind, preferred_session_ids, manage_token_hash, window_end)
			 VALUES (?, ?, ?, ?, ?, 'session_list', '[]', ?, ?)`
		)
		.run(
			id,
			experimentId,
			participantId,
			'Test Name',
			'test@example.test',
			`hash-${id}`,
			windowEnd
		);
}

/** Insert a better-auth session row. */
function seedAuthSession(id: string, expiresAtOffset: number) {
	// better-auth session requires a user row
	client
		.prepare(
			`INSERT OR IGNORE INTO "user" (id, name, email, email_verified, created_at, updated_at)
			 VALUES ('auth-user', 'Admin', 'admin@test', 1, ${Date.now()}, ${Date.now()})`
		)
		.run();
	client
		.prepare(
			`INSERT INTO "session"
				(id, expires_at, token, created_at, updated_at, user_id)
			 VALUES (?, ?, ?, ?, ?, 'auth-user')`
		)
		.run(id, Date.now() + expiresAtOffset, `tok-${id}`, Date.now(), Date.now());
}

// ---------------------------------------------------------------------------
// Helpers to read back state from the DB
// ---------------------------------------------------------------------------
function getBooking(id: string) {
	return client.prepare('SELECT * FROM bookings WHERE id = ?').get(id) as Record<string, unknown>;
}
function getPreference(id: string) {
	return client.prepare('SELECT * FROM booking_preferences WHERE id = ?').get(id) as Record<
		string,
		unknown
	>;
}
function getParticipant(id: string) {
	return client.prepare('SELECT * FROM participants WHERE id = ?').get(id) as Record<
		string,
		unknown
	>;
}
function authSessionCount() {
	return (client.prepare('SELECT COUNT(*) as n FROM "session"').get() as { n: number }).n;
}

// ---------------------------------------------------------------------------
// runAnonymizationJob
// ---------------------------------------------------------------------------
describe('runAnonymizationJob', () => {
	it('returns zero counts when the database is empty', async () => {
		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result).toEqual({
			bookingsAnonymised: 0,
			preferencesAnonymised: 0,
			participantsAnonymised: 0,
			authSessionsDeleted: 0
		});
	});

	it('does not anonymise a booking whose session ended less than retentionDays ago', async () => {
		seedExperiment('exp-1');
		// Session ended 1 ms ago — well within the 90-day window.
		seedSession('sess-1', 'exp-1', -1);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });

		const b = getBooking('book-1');
		expect(b.snapshot_name).toBe('Test Name');
		expect(b.snapshot_email).toBe('test@example.test');
		expect(b.anonymised_at).toBeNull();
	});

	it('anonymises a booking once the retention window has elapsed', async () => {
		seedExperiment('exp-1');
		// Session ended (retentionDays + 1) days ago.
		seedSession('sess-1', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.bookingsAnonymised).toBe(1);

		const b = getBooking('book-1');
		expect(b.snapshot_name).toBe('<anonymized>');
		expect(b.snapshot_email).toBe('<anonymized>');
		expect(b.snapshot_fields).toBe('{}');
		expect(b.anonymised_at).not.toBeNull();
	});

	it('uses per-experiment dataRetentionDays in preference to the default', async () => {
		// Experiment A has a short 10-day retention; experiment B uses the default 90.
		seedExperiment('exp-A', 10);
		seedExperiment('exp-B', null); // uses default

		// Both sessions ended 15 days ago.
		const offset = -15 * 86_400_000;
		seedSession('sess-A', 'exp-A', offset);
		seedSession('sess-B', 'exp-B', offset);
		seedParticipant('part-1');
		seedParticipant('part-2');
		seedBooking('book-A', 'sess-A', 'part-1');
		seedBooking('book-B', 'sess-B', 'part-2');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });

		// exp-A: 15 days > 10-day retention → should be anonymised
		expect(getBooking('book-A').anonymised_at).not.toBeNull();
		// exp-B: 15 days < 90-day default → should NOT be anonymised
		expect(getBooking('book-B').anonymised_at).toBeNull();
		expect(result.bookingsAnonymised).toBe(1);
	});

	it('anonymises a preference using windowEnd when it is set', async () => {
		seedExperiment('exp-1');
		seedParticipant('part-1');
		// windowEnd was (retentionDays + 1) days ago.
		seedPreference('pref-1', 'exp-1', 'part-1', -(DEFAULT_RETENTION + 1) * 86_400_000);

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.preferencesAnonymised).toBe(1);

		const p = getPreference('pref-1');
		expect(p.snapshot_name).toBe('<anonymized>');
		expect(p.snapshot_email).toBe('<anonymized>');
		expect(p.anonymised_at).not.toBeNull();
	});

	it('does not anonymise a preference whose windowEnd is still within the retention window', async () => {
		seedExperiment('exp-1');
		seedParticipant('part-1');
		// windowEnd is 1 day ago — within 90-day retention.
		seedPreference('pref-1', 'exp-1', 'part-1', -86_400_000);

		await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(getPreference('pref-1').anonymised_at).toBeNull();
	});

	it('falls back to updatedAt when windowEnd is absent on a preference', async () => {
		seedExperiment('exp-1');
		seedParticipant('part-1');
		// No windowEnd; row was created/updated just now → within retention window.
		seedPreference('pref-1', 'exp-1', 'part-1');

		await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(getPreference('pref-1').anonymised_at).toBeNull();

		// Fast-forward updatedAt to (retentionDays + 1) days ago.
		client
			.prepare('UPDATE booking_preferences SET updated_at = ? WHERE id = ?')
			.run(Date.now() - (DEFAULT_RETENTION + 1) * 86_400_000, 'pref-1');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.preferencesAnonymised).toBe(1);
		expect(getPreference('pref-1').anonymised_at).not.toBeNull();
	});

	it('anonymises a participant only after all their bookings are anonymised', async () => {
		seedExperiment('exp-1');
		// One old session (past retention) and one recent session.
		seedSession('sess-old', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedSession('sess-new', 'exp-1', -1); // just ended
		seedParticipant('part-1');
		seedBooking('book-old', 'sess-old', 'part-1');
		seedBooking('book-new', 'sess-new', 'part-1');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		// Old booking is anonymised but participant is not, because book-new is still live.
		expect(result.bookingsAnonymised).toBe(1);
		expect(result.participantsAnonymised).toBe(0);
		expect(getParticipant('part-1').anonymised_at).toBeNull();
		expect(getParticipant('part-1').email_normalised).toBe('part-1@test.example');
	});

	it('anonymises the participant record once all bookings have been anonymised', async () => {
		seedExperiment('exp-1');
		seedSession('sess-1', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.participantsAnonymised).toBe(1);

		const p = getParticipant('part-1');
		expect(p.anonymised_at).not.toBeNull();
		expect(p.email_normalised).toBe('<anonymized:part-1>');
		expect(p.display_name).toBeNull();
	});

	it('does not anonymise a participant while an unanonymised preference exists', async () => {
		seedExperiment('exp-1');
		// Booking is past retention, but the preference is still live.
		seedSession('sess-1', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');
		seedPreference('pref-1', 'exp-1', 'part-1', -1); // windowEnd 1 ms ago — within retention

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.bookingsAnonymised).toBe(1);
		expect(result.participantsAnonymised).toBe(0);
		expect(getParticipant('part-1').anonymised_at).toBeNull();
	});

	it('assigns a unique anonymised email to each participant', async () => {
		seedExperiment('exp-1');
		seedSession('sess-1', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedSession('sess-2', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedParticipant('part-A');
		seedParticipant('part-B');
		seedBooking('book-1', 'sess-1', 'part-A');
		seedBooking('book-2', 'sess-2', 'part-B');

		await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });

		const pA = getParticipant('part-A');
		const pB = getParticipant('part-B');
		expect(pA.email_normalised).toBe('<anonymized:part-A>');
		expect(pB.email_normalised).toBe('<anonymized:part-B>');
		// Must be distinct — unique index must not be violated.
		expect(pA.email_normalised).not.toBe(pB.email_normalised);
	});

	it('removes expired better-auth sessions', async () => {
		seedAuthSession('expired-1', -1000); // expired 1 s ago
		seedAuthSession('expired-2', -86_400_000); // expired yesterday
		seedAuthSession('live-1', 86_400_000); // expires tomorrow

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.authSessionsDeleted).toBe(2);
		expect(authSessionCount()).toBe(1);
	});

	it('leaves non-expired better-auth sessions untouched', async () => {
		seedAuthSession('live-1', 86_400_000);
		seedAuthSession('live-2', 2 * 86_400_000);

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.authSessionsDeleted).toBe(0);
		expect(authSessionCount()).toBe(2);
	});

	it('is idempotent — running twice does not corrupt data or re-count', async () => {
		seedExperiment('exp-1');
		seedSession('sess-1', 'exp-1', -(DEFAULT_RETENTION + 1) * 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		const first = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		const second = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });

		expect(first.bookingsAnonymised).toBe(1);
		expect(first.participantsAnonymised).toBe(1);
		// Second run should find nothing left to anonymise.
		expect(second.bookingsAnonymised).toBe(0);
		expect(second.participantsAnonymised).toBe(0);

		// Data should remain in its anonymised form, not be re-overwritten.
		const b = getBooking('book-1');
		expect(b.snapshot_name).toBe('<anonymized>');
		const p = getParticipant('part-1');
		expect(p.email_normalised).toBe('<anonymized:part-1>');
	});

	it('cleans up ghost participants with no activity after the global retention window', async () => {
		// Insert participant directly (no bookings or preferences).
		client
			.prepare(
				`INSERT INTO participants (id, email_normalised, created_at)
				 VALUES ('ghost', 'ghost@test.example', ?)`
			)
			.run(Date.now() - (DEFAULT_RETENTION + 1) * 86_400_000);

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.participantsAnonymised).toBe(1);
		expect(getParticipant('ghost').email_normalised).toBe('<anonymized:ghost>');
	});

	it('does not clean up a recent ghost participant', async () => {
		client
			.prepare('INSERT INTO participants (id, email_normalised) VALUES (?, ?)')
			.run('ghost', 'ghost@test.example');

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.participantsAnonymised).toBe(0);
		expect(getParticipant('ghost').anonymised_at).toBeNull();
	});

	it('returns accurate counts when multiple records are eligible', async () => {
		seedExperiment('exp-1');
		const offset = -(DEFAULT_RETENTION + 1) * 86_400_000;
		seedSession('s1', 'exp-1', offset);
		seedSession('s2', 'exp-1', offset);
		seedParticipant('p1');
		seedParticipant('p2');
		seedParticipant('p3');
		seedBooking('b1', 's1', 'p1');
		seedBooking('b2', 's1', 'p2');
		seedBooking('b3', 's2', 'p3');
		seedPreference('pref-1', 'exp-1', 'p1', offset);
		seedAuthSession('exp-sess', -1000);

		const result = await runAnonymizationJob(db, { defaultRetentionDays: DEFAULT_RETENTION });
		expect(result.bookingsAnonymised).toBe(3);
		expect(result.preferencesAnonymised).toBe(1);
		expect(result.participantsAnonymised).toBe(3);
		expect(result.authSessionsDeleted).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// forceAnonymiseParticipant
// ---------------------------------------------------------------------------
describe('forceAnonymiseParticipant', () => {
	it('immediately anonymises all bookings for the target, regardless of retention', async () => {
		seedExperiment('exp-1');
		// Session ends in the future — normally would never be anonymised yet.
		seedSession('sess-1', 'exp-1', 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		await forceAnonymiseParticipant(db, 'part-1');

		const b = getBooking('book-1');
		expect(b.snapshot_name).toBe('<anonymized>');
		expect(b.snapshot_email).toBe('<anonymized>');
		expect(b.snapshot_fields).toBe('{}');
		expect(b.anonymised_at).not.toBeNull();
	});

	it('immediately anonymises all preferences for the target', async () => {
		seedExperiment('exp-1');
		seedParticipant('part-1');
		// Preference with a future windowEnd — normally safe for the foreseeable future.
		seedPreference('pref-1', 'exp-1', 'part-1', 365 * 86_400_000);

		await forceAnonymiseParticipant(db, 'part-1');

		const p = getPreference('pref-1');
		expect(p.snapshot_name).toBe('<anonymized>');
		expect(p.snapshot_email).toBe('<anonymized>');
		expect(p.anonymised_at).not.toBeNull();
	});

	it('immediately anonymises the participant record', async () => {
		seedParticipant('part-1');

		await forceAnonymiseParticipant(db, 'part-1');

		const p = getParticipant('part-1');
		expect(p.email_normalised).toBe('<anonymized:part-1>');
		expect(p.display_name).toBeNull();
		expect(p.anonymised_at).not.toBeNull();
	});

	it('does not touch other participants', async () => {
		seedExperiment('exp-1');
		seedSession('sess-1', 'exp-1', 86_400_000);
		seedParticipant('part-1');
		seedParticipant('part-2');
		seedBooking('book-1', 'sess-1', 'part-1');
		seedBooking('book-2', 'sess-1', 'part-2');

		await forceAnonymiseParticipant(db, 'part-1');

		// part-1 is anonymised.
		expect(getParticipant('part-1').email_normalised).toBe('<anonymized:part-1>');
		expect(getBooking('book-1').snapshot_name).toBe('<anonymized>');

		// part-2 is untouched.
		expect(getParticipant('part-2').email_normalised).toBe('part-2@test.example');
		expect(getBooking('book-2').snapshot_name).toBe('Test Name');
	});

	it('is idempotent — calling twice leaves data in its anonymised state', async () => {
		seedExperiment('exp-1');
		seedSession('sess-1', 'exp-1', 86_400_000);
		seedParticipant('part-1');
		seedBooking('book-1', 'sess-1', 'part-1');

		await forceAnonymiseParticipant(db, 'part-1');
		// Record the anonymised_at timestamp from the first call.
		const firstAnonymisedAt = getBooking('book-1').anonymised_at as number;

		await forceAnonymiseParticipant(db, 'part-1');
		// The timestamp should not change on the second call.
		expect(getBooking('book-1').anonymised_at).toBe(firstAnonymisedAt);
		expect(getParticipant('part-1').email_normalised).toBe('<anonymized:part-1>');
	});

	it('handles a participant with no bookings or preferences gracefully', async () => {
		seedParticipant('part-1');

		await expect(forceAnonymiseParticipant(db, 'part-1')).resolves.toBeUndefined();
		expect(getParticipant('part-1').email_normalised).toBe('<anonymized:part-1>');
	});
});
