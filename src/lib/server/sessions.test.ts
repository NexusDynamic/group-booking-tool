/**
 * Tests for sessions.ts — uses a real in-memory SQLite DB so that partial
 * unique indexes and conflict-resolution SQL are exercised properly.
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

const { materialiseTemplate, createTemplate } = await import('./sessions');
const { createExperiment } = await import('./experiments');

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
		CREATE UNIQUE INDEX experiments_slug_idx ON experiments (slug);
		CREATE UNIQUE INDEX experiments_public_ics_token_idx ON experiments (public_ics_token);
		CREATE UNIQUE INDEX experiments_researcher_ics_token_idx ON experiments (researcher_ics_token);

		CREATE TABLE recurrence_templates (
			id TEXT PRIMARY KEY NOT NULL,
			experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
			label TEXT NOT NULL,
			rrule TEXT NOT NULL,
			dtstart_local TEXT NOT NULL,
			duration_minutes INTEGER NOT NULL,
			capacity INTEGER NOT NULL,
			min_participants INTEGER NOT NULL,
			location TEXT NOT NULL DEFAULT '',
			notes TEXT NOT NULL DEFAULT '',
			window_start INTEGER,
			window_end INTEGER,
			created_at INTEGER NOT NULL DEFAULT (cast(unixepoch('subsecond') * 1000 as integer))
		);
		CREATE INDEX recurrence_templates_experiment_idx ON recurrence_templates (experiment_id);

		CREATE TABLE sessions (
			id TEXT PRIMARY KEY NOT NULL,
			experiment_id TEXT NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,
			source_template_id TEXT REFERENCES recurrence_templates(id) ON DELETE SET NULL,
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
		CREATE INDEX sessions_experiment_starts_idx ON sessions (experiment_id, starts_at);
		CREATE INDEX sessions_starts_idx ON sessions (starts_at);
		CREATE UNIQUE INDEX sessions_template_starts_idx
			ON sessions (source_template_id, starts_at)
			WHERE source_template_id IS NOT NULL;

		CREATE TABLE bookings (
			id TEXT PRIMARY KEY NOT NULL,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			participant_id TEXT NOT NULL,
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

beforeAll(() => {
	createTables();
});

afterAll(() => {
	client.close();
});

beforeEach(() => {
	client.exec(`
		DELETE FROM bookings;
		DELETE FROM sessions;
		DELETE FROM recurrence_templates;
		DELETE FROM experiments;
	`);
});

async function seedExperiment() {
	return createExperiment({
		name: 'Test Experiment',
		slug: 'test-exp',
		description: '',
		durationMinutes: 60,
		inclusionCriteria: '',
		exclusionCriteria: '',
		minParticipants: 2,
		maxParticipants: 5,
		excludePriorAttendees: true,
		experimenterName: 'Test Experimenter',
		experimenterEmail: 'test@example.com',
		location: 'Test Location',
		notes: 'Test Notes'
	});
}

describe('materialiseTemplate', () => {
	it('inserts sessions from a no-window template (regression: onConflictDoNothing with partial index)', async () => {
		// Previously, specifying target columns in onConflictDoNothing generated
		// ON CONFLICT(col1, col2) DO NOTHING, which SQLite rejects for partial
		// unique indexes. Every insert threw "does not match any PRIMARY KEY or
		// UNIQUE constraint", which was silently caught, leaving inserted = 0.
		const exp = await seedExperiment();
		const tmpl = await createTemplate({
			experimentId: exp.id,
			label: 'Monday 09:00',
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			capacity: 5,
			minParticipants: 2,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: new Date('2026-06-29T21:59:59Z') // end-of-day Jun 29 CEST
		});

		const inserted = await materialiseTemplate(tmpl.id);

		// Mondays Jun 1, 8, 15, 22, 29 = 5
		expect(inserted).toBe(5);
		const rows = client.prepare('SELECT * FROM sessions WHERE source_template_id = ?').all(tmpl.id);
		expect(rows).toHaveLength(5);
	});

	it('is idempotent — re-running generate does not duplicate sessions', async () => {
		const exp = await seedExperiment();
		const tmpl = await createTemplate({
			experimentId: exp.id,
			label: 'Monday 09:00',
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			capacity: 5,
			minParticipants: 2,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: new Date('2026-06-29T21:59:59Z')
		});

		await materialiseTemplate(tmpl.id);
		const second = await materialiseTemplate(tmpl.id);

		expect(second).toBe(0); // nothing new to insert
		const rows = client.prepare('SELECT * FROM sessions WHERE source_template_id = ?').all(tmpl.id);
		expect(rows).toHaveLength(5); // still just 5, not 10
	});

	it('generates sessions across a full year when no window is set', async () => {
		const exp = await seedExperiment();
		const tmpl = await createTemplate({
			experimentId: exp.id,
			label: 'Weekly open-ended',
			rrule: 'FREQ=WEEKLY;BYDAY=MO',
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			capacity: 5,
			minParticipants: 2
		});

		const inserted = await materialiseTemplate(tmpl.id);

		// 52 or 53 Mondays in a year
		expect(inserted).toBeGreaterThanOrEqual(52);
		expect(inserted).toBeLessThanOrEqual(53);
	});
});
