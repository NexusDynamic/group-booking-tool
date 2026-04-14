/**
 * Repo-level tests for experiments.ts.
 *
 * Uses the real drizzle + better-sqlite3 stack against an in-memory database
 * built from the live schema objects, so the tests exercise actual SQL
 * (unique indexes, FK cascades) rather than mocks.
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

beforeAll(async () => applySchema(client));
afterAll(() => client.close());
beforeEach(() => clearTables(client));

function baseForm(overrides: Record<string, unknown> = {}) {
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
		experimenterName: 'A. Researcher',
		experimenterEmail: 'researcher@example.com',
		location: 'Lab 1',
		notes: '',
		dataRetentionDays: null,
		endDate: null,
		privacyNoticeText: '',
		privacyNoticeUrl: '',
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

	it('persists dataRetentionDays when set', async () => {
		const e = await createExperiment(baseForm({ dataRetentionDays: 180 }));
		expect((await getExperimentById(e.id))?.dataRetentionDays).toBe(180);
	});

	it('deletes an experiment with no bookings', async () => {
		const e = await createExperiment(baseForm());
		await deleteExperiment(e.id);
		expect(await getExperimentById(e.id)).toBeUndefined();
	});

	it('refuses to delete when a session has a booking', async () => {
		const e = await createExperiment(baseForm());
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
