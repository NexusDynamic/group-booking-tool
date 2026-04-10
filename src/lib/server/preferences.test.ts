/**
 * Repo tests for preferences.ts. Covers:
 *   - session-list round-trip (create → suggestMatchingSessions)
 *   - recurring match against sessions whose wall-clock fits the rrule
 *   - assignPreferenceToSessions creates bookings and flips status
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';

vi.mock('$env/dynamic/private', () => ({
	env: { DATABASE_URL: ':memory:', CLINIC_TZ: 'Europe/Copenhagen' }
}));

const client = new Database(':memory:');
const memDb = drizzle(client, { schema });
vi.mock('./db', () => ({ db: memDb }));

const {
	createRecurringPreference,
	createSessionListPreference,
	suggestMatchingSessions,
	assignPreferenceToSessions,
	getPreferenceById
} = await import('./preferences');

function ddl() {
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
		CREATE TABLE booking_preferences (
			id TEXT PRIMARY KEY NOT NULL,
			experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
			participant_id TEXT NOT NULL REFERENCES participants(id),
			snapshot_name TEXT NOT NULL,
			snapshot_email TEXT NOT NULL,
			snapshot_fields TEXT NOT NULL DEFAULT '{}',
			kind TEXT NOT NULL,
			rrule TEXT,
			dtstart_local TEXT,
			duration_minutes INTEGER,
			window_start INTEGER,
			window_end INTEGER,
			preferred_session_ids TEXT NOT NULL DEFAULT '[]',
			notes TEXT NOT NULL DEFAULT '',
			status TEXT NOT NULL DEFAULT 'pending',
			manage_token_hash TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)),
			updated_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE UNIQUE INDEX booking_preferences_manage_token_idx ON booking_preferences (manage_token_hash);
	`);
}

function seedExperiment() {
	client
		.prepare(
			'INSERT INTO experiments (id, slug, name, duration_minutes, public_ics_token, researcher_ics_token) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run('exp-1', 'exp-1', 'Exp', 60, 'pub', 'res');
}

function seedSession(id: string, startsAtIso: string, capacity = 4) {
	const starts = new Date(startsAtIso).getTime();
	client
		.prepare(
			'INSERT INTO sessions (id, experiment_id, starts_at, ends_at, capacity, min_participants) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run(id, 'exp-1', starts, starts + 60 * 60 * 1000, capacity, 1);
}

beforeAll(() => ddl());
afterAll(() => client.close());
beforeEach(() => {
	client.exec(
		'DELETE FROM bookings; DELETE FROM booking_preferences; DELETE FROM sessions; DELETE FROM participants; DELETE FROM experiments;'
	);
	seedExperiment();
});

describe('preferences repo', () => {
	it('stores and retrieves a session-list preference', async () => {
		// 2026-06-01 and 2026-06-03 — both future. 09:00 local = 07:00 UTC in summer.
		seedSession('sess-A', '2026-06-01T07:00:00Z');
		seedSession('sess-B', '2026-06-03T07:00:00Z');
		seedSession('sess-C', '2026-06-05T07:00:00Z');

		const { preference } = await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'A',
			email: 'a@b.test',
			sessionIds: ['sess-A', 'sess-C'],
			notes: 'note'
		});
		expect(preference.kind).toBe('session_list');
		expect(JSON.parse(preference.preferredSessionIds)).toEqual(['sess-A', 'sess-C']);

		const matches = await suggestMatchingSessions(preference);
		expect(matches.map((m) => m.id).sort()).toEqual(['sess-A', 'sess-C']);
	});

	it('recurring preference matches only sessions whose time fits the rrule', async () => {
		// Monday 2026-06-01 09:00 local Europe/Copenhagen = 07:00 UTC (CEST)
		// Monday 2026-06-08 09:00 local = 07:00 UTC
		// Wednesday 2026-06-03 09:00 local = 07:00 UTC (should NOT match MO rule)
		seedSession('sess-mon1', '2026-06-01T07:00:00Z');
		seedSession('sess-wed', '2026-06-03T07:00:00Z');
		seedSession('sess-mon2', '2026-06-08T07:00:00Z');

		const { preference } = await createRecurringPreference({
			experimentId: 'exp-1',
			name: 'A',
			email: 'a@b.test',
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: new Date('2026-06-30T00:00:00Z'),
			notes: ''
		});

		const matches = await suggestMatchingSessions(preference);
		const ids = matches.map((m) => m.id).sort();
		expect(ids).toEqual(['sess-mon1', 'sess-mon2']);
	});

	it('assignPreferenceToSessions creates bookings and flips status to assigned', async () => {
		seedSession('sess-A', '2026-06-01T07:00:00Z', 4);
		seedSession('sess-B', '2026-06-08T07:00:00Z', 4);

		const { preference } = await createSessionListPreference({
			experimentId: 'exp-1',
			name: 'A',
			email: 'a@b.test',
			sessionIds: ['sess-A', 'sess-B'],
			notes: ''
		});
		const { created, errors } = await assignPreferenceToSessions(preference.id, [
			'sess-A',
			'sess-B'
		]);
		expect(created).toBe(2);
		expect(errors).toHaveLength(0);

		const refreshed = await getPreferenceById(preference.id);
		expect(refreshed?.status).toBe('assigned');

		const bookingCount = client
			.prepare('SELECT COUNT(*) as n FROM bookings')
			.get() as { n: number };
		expect(bookingCount.n).toBe(2);
	});
});
