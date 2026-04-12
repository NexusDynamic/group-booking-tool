/**
 * Repo-level tests for bookings.ts. Focus: capacity enforcement (serial
 * overflow protection — transactional) and token-by-hash lookup.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';

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

function createTables() {
	client.exec(`
		CREATE TABLE experiments (
			id TEXT PRIMARY KEY NOT NULL,
			slug TEXT NOT NULL,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			duration_minutes INTEGER NOT NULL,
			inclusion_criteria TEXT NOT NULL DEFAULT '',
			exclusion_criteria TEXT NOT NULL DEFAULT '',
			min_participants INTEGER NOT NULL DEFAULT 1,
			max_participants INTEGER NOT NULL DEFAULT 1,
			required_fields TEXT NOT NULL DEFAULT '[]',
			exclude_prior_attendees INTEGER NOT NULL DEFAULT 1,
			experimenter_name TEXT NOT NULL DEFAULT 'Experimenter',
			experimenter_email TEXT NOT NULL DEFAULT 'experimenter@example.com',
			location TEXT NOT NULL DEFAULT '',
			is_published INTEGER NOT NULL DEFAULT 0,
			public_ics_token TEXT NOT NULL,
			researcher_ics_token TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);

		CREATE TABLE participants (
			id TEXT PRIMARY KEY NOT NULL,
			email_normalised TEXT NOT NULL,
			display_name TEXT,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE UNIQUE INDEX participants_email_idx ON participants (email_normalised);

		CREATE TABLE sessions (
			id TEXT PRIMARY KEY NOT NULL,
			experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
			source_template_id TEXT,
			starts_at INTEGER NOT NULL,
			ends_at INTEGER NOT NULL,
			capacity INTEGER NOT NULL,
			min_participants INTEGER NOT NULL,
			location TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'scheduled',
			notes TEXT NOT NULL DEFAULT '',
			public_ics_token TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);

		CREATE TABLE bookings (
			id TEXT PRIMARY KEY NOT NULL,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			participant_id TEXT NOT NULL REFERENCES participants(id),
			snapshot_name TEXT NOT NULL,
			snapshot_email TEXT NOT NULL,
			snapshot_fields TEXT NOT NULL DEFAULT '{}',
			status TEXT NOT NULL DEFAULT 'confirmed',
			manage_token_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE UNIQUE INDEX bookings_manage_token_idx ON bookings (manage_token_hash);
	`);
}

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

beforeAll(() => createTables());
afterAll(() => client.close());
beforeEach(() => {
	client.exec(
		'DELETE FROM bookings; DELETE FROM sessions; DELETE FROM participants; DELETE FROM experiments;'
	);
});

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
