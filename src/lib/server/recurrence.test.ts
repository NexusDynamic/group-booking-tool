/**
 * Unit tests for recurrence expansion — exercise DST transitions and window
 * bounds. Pure function, no DB needed.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: { CLINIC_TZ: 'Europe/Copenhagen' } }));

const { expandTemplate, buildWeeklyRRule } = await import('./recurrence');
const { localToUtc } = await import('./time');

describe('expandTemplate', () => {
	it('generates weekly Monday 09:00 occurrences across a 4-week window', () => {
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO'),
			dtstartLocal: '2026-06-01T09:00', // Monday
			durationMinutes: 120,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: new Date('2026-06-29T00:00:00Z')
		});
		expect(out).toHaveLength(4);

		// All should be 09:00 Europe/Copenhagen in summer = 07:00 UTC
		for (const occ of out) {
			expect(occ.startsAt.getUTCHours()).toBe(7);
			expect(occ.startsAt.getUTCMinutes()).toBe(0);
			expect(occ.endsAt.getTime() - occ.startsAt.getTime()).toBe(120 * 60 * 1000);
		}

		expect(out[0].startsAt.toISOString()).toBe('2026-06-01T07:00:00.000Z');
		expect(out[3].startsAt.toISOString()).toBe('2026-06-22T07:00:00.000Z');
	});

	it('preserves wall-clock across the spring DST boundary', () => {
		// Europe/Copenhagen 2026 spring-forward: 2026-03-29
		// DTSTART is the Monday before; expand across the DST boundary and
		// verify the wall clock stays at 09:00 local on both sides.
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO'),
			dtstartLocal: '2026-03-23T09:00',
			durationMinutes: 60,
			windowStart: new Date('2026-03-22T00:00:00Z'),
			windowEnd: new Date('2026-04-20T00:00:00Z')
		});

		// Should contain 2026-03-23, 2026-03-30, 2026-04-06, 2026-04-13
		expect(out).toHaveLength(4);

		// 2026-03-23 is CET (UTC+1) → 09:00 local = 08:00 UTC
		expect(out[0].startsAt.toISOString()).toBe('2026-03-23T08:00:00.000Z');

		// 2026-03-30 is CEST (UTC+2) → 09:00 local = 07:00 UTC
		expect(out[1].startsAt.toISOString()).toBe('2026-03-30T07:00:00.000Z');

		// Later weeks still UTC+2
		expect(out[2].startsAt.toISOString()).toBe('2026-04-06T07:00:00.000Z');
		expect(out[3].startsAt.toISOString()).toBe('2026-04-13T07:00:00.000Z');
	});

	it('honours window bounds even after DST shifts', () => {
		// Window that just barely includes the first Monday
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO'),
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			windowStart: new Date('2026-06-01T07:00:00Z'),
			windowEnd: new Date('2026-06-01T08:00:00Z')
		});
		expect(out).toHaveLength(1);
		expect(out[0].startsAt.toISOString()).toBe('2026-06-01T07:00:00.000Z');
	});

	it('includes a session on the windowEnd date when windowEnd is end-of-day (T23:59:59)', () => {
		// Regression: windowEnd was stored as T00:00 local (= prior evening in UTC),
		// which excluded sessions on the end date itself. The page server now uses
		// T23:59:59 so that sessions on the end date are included.
		// Jun 29 09:00 CEST = 07:00 UTC; T23:59:59 CEST = 21:59:59 UTC → included.
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO'),
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: localToUtc('2026-06-29T23:59:59') // end-of-day
		});
		// Mondays: Jun 1, 8, 15, 22, 29 → 5 sessions
		expect(out).toHaveLength(5);
		expect(out[4].startsAt.toISOString()).toBe('2026-06-29T07:00:00.000Z');
	});

	it('excludes a session on the windowEnd date when windowEnd is midnight (old T00:00 bug)', () => {
		// Documents the old incorrect behaviour so the regression is visible in tests.
		// Jun 29 T00:00 CEST = Jun 28 22:00 UTC; session at 07:00 UTC Jun 29 > 22:00 → excluded.
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO'),
			dtstartLocal: '2026-06-01T09:00',
			durationMinutes: 60,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: localToUtc('2026-06-29T00:00') // midnight = old bug
		});
		// Jun 29 session is excluded → only 4
		expect(out).toHaveLength(4);
		expect(out[3].startsAt.toISOString()).toBe('2026-06-22T07:00:00.000Z');
	});

	it('supports multiple weekdays via BYDAY', () => {
		const out = expandTemplate({
			rrule: buildWeeklyRRule('MO,WE,FR'),
			dtstartLocal: '2026-06-01T10:00', // Mon
			durationMinutes: 60,
			windowStart: new Date('2026-06-01T00:00:00Z'),
			windowEnd: new Date('2026-06-08T00:00:00Z')
		});
		// Mon Jun 1, Wed Jun 3, Fri Jun 5 = 3
		expect(out).toHaveLength(3);
		const days = out.map((o) => o.startsAt.getUTCDate());
		expect(days).toEqual([1, 3, 5]);
	});
});
