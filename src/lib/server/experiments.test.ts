/**
 * Repo-level tests for experiments.ts.
 *
 * Uses the real drizzle + better-sqlite3 stack against an in-memory database
 * built from a fresh copy of schema.ts, so the tests exercise actual SQL
 * (unique indexes, FK cascades) rather than mocks.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema';

// Replace $env/dynamic/private import BEFORE importing any module that reads it.
vi.mock('$env/dynamic/private', () => ({ env: { DATABASE_URL: ':memory:' } }));

// Replace the db module with one that points at our in-memory sqlite instance.
const client = new Database(':memory:');
const memDb = drizzle(client, { schema });

vi.mock('./db', () => ({ db: memDb }));

// Import under test AFTER mocks are in place.
const {
	createExperiment,
	deleteExperiment,
	ExperimentHasBookingsError,
	getExperimentById,
	getExperimentBySlug,
	listExperiments,
	rotateIcsToken,
	setPublished,
	SlugInUseError,
	updateExperiment,
	updateRequiredFields
} = await import('./experiments');

function createTables() {
	// Minimal DDL — just the experiments-related tables needed for these tests.
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

beforeAll(() => {
	createTables();
});

afterAll(() => {
	client.close();
});

beforeEach(() => {
	client.exec('DELETE FROM bookings; DELETE FROM sessions; DELETE FROM participants; DELETE FROM experiments;');
});

function baseForm(overrides = {}) {
	return {
		name: 'Reaction Time Study',
		slug: 'reaction-time-study',
		description: 'desc',
		durationMinutes: 60,
		inclusionCriteria: '',
		exclusionCriteria: '',
		minParticipants: 2,
		maxParticipants: 4,
		excludePriorAttendees: true,
		...overrides
	};
}

describe('experiments repo', () => {
	it('creates and lists experiments, generating ICS tokens', async () => {
		const e = await createExperiment(baseForm());
		expect(e.id).toBeTruthy();
		expect(e.publicIcsToken).toHaveLength(43);
		expect(e.researcherIcsToken).toHaveLength(43);
		expect(e.publicIcsToken).not.toBe(e.researcherIcsToken);

		const list = await listExperiments();
		expect(list).toHaveLength(1);
		expect(list[0].slug).toBe('reaction-time-study');
	});

	it('rejects a duplicate slug on create', async () => {
		await createExperiment(baseForm());
		await expect(createExperiment(baseForm({ name: 'Other' }))).rejects.toBeInstanceOf(
			SlugInUseError
		);
	});

	it('looks up by slug and by id', async () => {
		const created = await createExperiment(baseForm());
		const bySlug = await getExperimentBySlug('reaction-time-study');
		const byId = await getExperimentById(created.id);
		expect(bySlug?.id).toBe(created.id);
		expect(byId?.id).toBe(created.id);
	});

	it('updates but rejects a slug collision with a different experiment', async () => {
		const a = await createExperiment(baseForm());
		const b = await createExperiment(baseForm({ slug: 'other', name: 'Other' }));

		await updateExperiment(a.id, baseForm({ name: 'Renamed' }));
		const refreshed = await getExperimentById(a.id);
		expect(refreshed?.name).toBe('Renamed');

		await expect(
			updateExperiment(b.id, baseForm({ slug: 'reaction-time-study' }))
		).rejects.toBeInstanceOf(SlugInUseError);
	});

	it('toggles published state', async () => {
		const e = await createExperiment(baseForm());
		expect(e.isPublished).toBe(false);
		await setPublished(e.id, true);
		expect((await getExperimentById(e.id))?.isPublished).toBe(true);
		await setPublished(e.id, false);
		expect((await getExperimentById(e.id))?.isPublished).toBe(false);
	});

	it('saves and reads required_fields JSON', async () => {
		const e = await createExperiment(baseForm());
		await updateRequiredFields(e.id, [
			{ key: 'age', label: 'Age', type: 'number', required: true },
			{ key: 'notes', label: 'Notes', type: 'text', required: false }
		]);
		const refreshed = await getExperimentById(e.id);
		expect(JSON.parse(refreshed!.requiredFields)).toEqual([
			{ key: 'age', label: 'Age', type: 'number', required: true },
			{ key: 'notes', label: 'Notes', type: 'text', required: false }
		]);
	});

	it('deletes an experiment with no bookings', async () => {
		const e = await createExperiment(baseForm());
		await deleteExperiment(e.id);
		expect(await getExperimentById(e.id)).toBeUndefined();
	});

	it('refuses to delete when a session has a booking', async () => {
		const e = await createExperiment(baseForm());
		// Seed a session + participant + booking directly via the underlying client
		client
			.prepare(
				'INSERT INTO sessions (id, experiment_id, starts_at, ends_at, capacity, min_participants, public_ics_token) VALUES (?, ?, ?, ?, ?, ?, ?)'
			)
			.run('sess-1', e.id, Date.now() + 86_400_000, Date.now() + 86_400_000 + 3_600_000, 4, 2, 'pub');
		client
			.prepare('INSERT INTO participants (id, email_normalised) VALUES (?, ?)')
			.run('part-1', 'a@b.test');
		client
			.prepare(
				'INSERT INTO bookings (id, session_id, participant_id, snapshot_name, snapshot_email, manage_token_hash) VALUES (?, ?, ?, ?, ?, ?)'
			)
			.run('book-1', 'sess-1', 'part-1', 'A B', 'a@b.test', 'hash');

		await expect(deleteExperiment(e.id)).rejects.toBeInstanceOf(ExperimentHasBookingsError);
		expect(await getExperimentById(e.id)).toBeDefined();
	});

	it('rotates ICS tokens', async () => {
		const e = await createExperiment(baseForm());
		const beforePublic = e.publicIcsToken;
		const beforeResearcher = e.researcherIcsToken;

		await rotateIcsToken(e.id, 'public');
		const afterPublic = await getExperimentById(e.id);
		expect(afterPublic?.publicIcsToken).not.toBe(beforePublic);
		expect(afterPublic?.researcherIcsToken).toBe(beforeResearcher);

		await rotateIcsToken(e.id, 'researcher');
		const afterBoth = await getExperimentById(e.id);
		expect(afterBoth?.researcherIcsToken).not.toBe(beforeResearcher);
	});
});
