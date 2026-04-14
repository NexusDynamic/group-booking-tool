/**
 * Tests for sessions.ts — uses a real in-memory SQLite DB so that partial
 * unique indexes and conflict-resolution SQL are exercised properly.
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

const { materialiseTemplate, createTemplate } = await import('./sessions');
const { createExperiment } = await import('./experiments');

beforeAll(async () => applySchema(client));
afterAll(() => client.close());
beforeEach(() => clearTables(client));

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
		notes: 'Test Notes',
		dataRetentionDays: null,
		endDate: null,
		privacyNoticeText: '',
		privacyNoticeUrl: '',
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
