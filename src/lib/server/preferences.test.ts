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
import { applySchema, clearTables } from './db/test-helpers';

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

beforeAll(async () => applySchema(client));
afterAll(() => client.close());
beforeEach(() => {
	clearTables(client);
	client
		.prepare(
			'INSERT INTO experiments (id, slug, name, duration_minutes, public_ics_token, researcher_ics_token) VALUES (?, ?, ?, ?, ?, ?)'
		)
		.run('exp-1', 'exp-1', 'Exp', 60, 'pub', 'res');
});

function seedSession(id: string, startsAtIso: string, capacity = 4) {
	const starts = new Date(startsAtIso).getTime();
	client
		.prepare(
			'INSERT INTO sessions (id, experiment_id, starts_at, ends_at, capacity, min_participants, public_ics_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
		)
		.run(id, 'exp-1', starts, starts + 60 * 60 * 1000, capacity, 1, `pub-${id}`);
}

describe('preferences repo', () => {
	it('stores and retrieves a session-list preference', async () => {
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

		const bookingCount = client.prepare('SELECT COUNT(*) as n FROM bookings').get() as {
			n: number;
		};
		expect(bookingCount.n).toBe(2);
	});
});
