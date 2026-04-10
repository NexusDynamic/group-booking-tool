import { describe, it, expect } from 'vitest';
import { formatInTz, localToUtc, tzOffsetMs } from './time';

describe('time', () => {
	it('localToUtc: converts winter (CET, UTC+1) wall clock', () => {
		// 2026-01-15 09:00 Europe/Copenhagen (CET, UTC+1) === 08:00 UTC
		const utc = localToUtc('2026-01-15T09:00', 'Europe/Copenhagen');
		expect(utc.toISOString()).toBe('2026-01-15T08:00:00.000Z');
	});

	it('localToUtc: converts summer (CEST, UTC+2) wall clock', () => {
		// 2026-06-15 09:00 Europe/Copenhagen (CEST, UTC+2) === 07:00 UTC
		const utc = localToUtc('2026-06-15T09:00', 'Europe/Copenhagen');
		expect(utc.toISOString()).toBe('2026-06-15T07:00:00.000Z');
	});

	it('localToUtc: crosses the spring DST boundary correctly', () => {
		// Spring-forward in Europe/Copenhagen 2026: 2026-03-29 02:00 → 03:00 local
		// A 09:00 local time the day before DST is UTC+1 (08:00 UTC);
		// a 09:00 local time the day after DST is UTC+2 (07:00 UTC).
		const before = localToUtc('2026-03-28T09:00', 'Europe/Copenhagen');
		const after = localToUtc('2026-03-30T09:00', 'Europe/Copenhagen');
		expect(before.toISOString()).toBe('2026-03-28T08:00:00.000Z');
		expect(after.toISOString()).toBe('2026-03-30T07:00:00.000Z');
	});

	it('localToUtc: handles UTC explicitly', () => {
		const utc = localToUtc('2026-06-15T09:00', 'UTC');
		expect(utc.toISOString()).toBe('2026-06-15T09:00:00.000Z');
	});

	it('localToUtc: rejects malformed input', () => {
		expect(() => localToUtc('not-a-date')).toThrow();
	});

	it('tzOffsetMs: positive east of UTC', () => {
		// Europe/Copenhagen in summer = UTC+2 = 7_200_000 ms
		const summerInstant = Date.UTC(2026, 5, 15, 12, 0, 0);
		expect(tzOffsetMs(summerInstant, 'Europe/Copenhagen')).toBe(7_200_000);
	});

	it('formatInTz: renders a UTC instant in the target tz', () => {
		// 08:00 UTC → 10:00 Copenhagen in summer
		const instant = Date.UTC(2026, 5, 15, 8, 0, 0);
		const formatted = formatInTz(instant, 'Europe/Copenhagen', { timeStyle: 'short' });
		expect(formatted).toContain('10:00');
	});
});
