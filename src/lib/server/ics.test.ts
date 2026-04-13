/**
 * Tests for ics.ts. Focus on:
 *   - SUMMARY contains the live (n/cap) count
 *   - Researcher feed includes a reminder VEVENT iff its condition matches
 *   - below_minimum and at_capacity gates work correctly
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

const { buildExperimentFeed, buildResearcherFeed } = await import('./ics');

beforeAll(async () => applySchema(client));
afterAll(() => client.close());
beforeEach(() => clearTables(client));

function seedExperiment(opts: { description?: string } = {}) {
	client
		.prepare(
			`INSERT INTO experiments
				(id, slug, name, description, duration_minutes, min_participants, max_participants,
				 public_ics_token, researcher_ics_token)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.run('exp-1', 'exp-1', 'Reaction Time Study', opts.description ?? 'A study', 60, 2, 4, 'pub', 'res');
}

// Seed a future session so the ICS lookahead includes it.
function seedSession(id: string, startsAt: Date, capacity = 4, minParticipants = 2) {
	client
		.prepare(
			`INSERT INTO sessions
				(id, experiment_id, starts_at, ends_at, capacity, min_participants, public_ics_token)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, 'exp-1', startsAt.getTime(), startsAt.getTime() + 60 * 60 * 1000, capacity, minParticipants, `pub-${id}`);
}

function seedBooking(id: string, sessionId: string, status = 'confirmed') {
	const pid = `p-${id}`;
	client.prepare('INSERT INTO participants (id, email_normalised) VALUES (?, ?)').run(pid, `${id}@b.test`);
	client
		.prepare(
			`INSERT INTO bookings
				(id, session_id, participant_id, snapshot_name, snapshot_email, status, manage_token_hash)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		.run(id, sessionId, pid, id, `${id}@b.test`, status, `hash-${id}`);
}

function seedRule(
	id: string,
	condition: 'always' | 'below_minimum' | 'at_capacity',
	offsetMinutes = 60,
	durationMinutes = 15,
	label = 'Reminder'
) {
	client
		.prepare(
			`INSERT INTO reminder_rules
				(id, experiment_id, label, offset_minutes_before, condition, duration_minutes)
			 VALUES (?, ?, ?, ?, ?, ?)`
		)
		.run(id, 'exp-1', label, offsetMinutes, condition, durationMinutes);
}

const future = () => new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

describe('buildExperimentFeed', () => {
	it('emits one VEVENT per scheduled session with live count in SUMMARY', async () => {
		seedExperiment();
		const s1 = future();
		const s2 = new Date(s1.getTime() + 7 * 24 * 60 * 60 * 1000);
		seedSession('sess-1', s1, 4, 2);
		seedSession('sess-2', s2, 4, 2);
		seedBooking('b1', 'sess-1');
		seedBooking('b2', 'sess-1');
		seedBooking('b3', 'sess-1', 'cancelled'); // not counted

		const ics = await buildExperimentFeed('exp-1', { host: 'test.example' });
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('[PENDING-CONFIRMATION] Reaction Time Study (2/4)');
		expect(ics).toContain('[PENDING-CONFIRMATION] Reaction Time Study (0/4)');
		expect(ics).toContain('UID:sess-1@test.example');
		expect(ics).toContain('UID:sess-2@test.example');
	});

	it('excludes cancelled sessions', async () => {
		seedExperiment();
		const s1 = future();
		seedSession('sess-1', s1, 4, 2);
		client.prepare("UPDATE sessions SET status='cancelled' WHERE id = 'sess-1'").run();

		const ics = await buildExperimentFeed('exp-1', { host: 'test.example' });
		expect(ics).not.toContain('UID:sess-1@test.example');
	});
});

describe('buildResearcherFeed', () => {
	it('always rule emits a reminder VEVENT per session', async () => {
		seedExperiment();
		const s1 = future();
		seedSession('sess-1', s1, 4, 2);
		seedRule('rule-1', 'always', 1440, 15, 'Email participants');

		const ics = await buildResearcherFeed('exp-1', { host: 'test.example' });
		expect(ics).toContain('UID:sess-1@test.example');
		expect(ics).toContain('UID:sess-1-reminder-rule-1@test.example');
		expect(ics).toContain('Email participants');
	});

	it('below_minimum rule fires only when confirmed < minimum', async () => {
		seedExperiment();
		const s1 = future();
		seedSession('sess-1', s1, 4, 2);
		seedSession('sess-2', new Date(s1.getTime() + 3600_000), 4, 2);
		// sess-1 has 1 booking (below min of 2), sess-2 has 2 (at min).
		seedBooking('b1', 'sess-1');
		seedBooking('b2', 'sess-2');
		seedBooking('b3', 'sess-2');
		seedRule('rule-1', 'below_minimum', 60, 15, 'Consider cancelling');

		const ics = await buildResearcherFeed('exp-1', { host: 'test.example' });
		expect(ics).toContain('UID:sess-1-reminder-rule-1@test.example');
		expect(ics).not.toContain('UID:sess-2-reminder-rule-1@test.example');
	});

	it('at_capacity rule fires only when confirmed >= capacity', async () => {
		seedExperiment();
		const s1 = future();
		seedSession('sess-full', s1, 2, 1);
		seedSession('sess-empty', new Date(s1.getTime() + 3600_000), 2, 1);
		seedBooking('b1', 'sess-full');
		seedBooking('b2', 'sess-full');
		seedRule('rule-1', 'at_capacity', 60, 15, 'Confirm with participants');

		const ics = await buildResearcherFeed('exp-1', { host: 'test.example' });
		expect(ics).toContain('UID:sess-full-reminder-rule-1@test.example');
		expect(ics).not.toContain('UID:sess-empty-reminder-rule-1@test.example');
	});
});
