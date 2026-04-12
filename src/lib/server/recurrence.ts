// rrule's package.json has no `exports` map and its `main` is a CJS bundle,
// so Node's ESM loader refuses named imports like `{ RRule }`. Import the
// default and destructure — the CJS->ESM bridge hands us the full module
// namespace as the default export.
import rrulePkg from 'rrule';
const { RRule } = rrulePkg;
type Weekday = InstanceType<typeof rrulePkg.Weekday>;
import { CLINIC_TZ, localToUtc, tzOffsetMs } from './time';

/**
 * Expand a weekly recurrence template into concrete UTC session instants
 * within an optional window.
 *
 * Storage contract:
 *   - `dtstartLocal`  — ISO local datetime in the clinic timezone, e.g.
 *     "2026-06-01T09:00". This is the wall-clock source of truth.
 *   - `rrule`         — RFC 5545 RRULE string without DTSTART, e.g.
 *     "FREQ=WEEKLY;BYDAY=MO,WE".
 *   - `windowStart`/`windowEnd` — UTC epoch ms bounds. If both are null the
 *     caller is responsible for limiting the expansion some other way.
 *
 * We compute the effective UTC dtstart from `dtstartLocal` + the clinic tz,
 * then ask `rrule` to produce occurrences in UTC wall-clock. For weekly
 * recurrences whose DTSTART sits before the start of DST, rrule would give
 * us times that drift by an hour across the boundary — so we re-apply the
 * clinic-tz wall-clock to each occurrence to keep 09:00 == 09:00 on both
 * sides of a DST transition.
 */
export interface ExpandInput {
	rrule: string; // RRULE string without DTSTART line
	dtstartLocal: string; // "YYYY-MM-DDTHH:mm"
	durationMinutes: number;
	windowStart?: Date | null;
	windowEnd?: Date | null;
	tz?: string;
}

export interface ExpandedOccurrence {
	startsAt: Date;
	endsAt: Date;
}

export function expandTemplate(input: ExpandInput): ExpandedOccurrence[] {
	const tz = input.tz ?? CLINIC_TZ;

	// Parse the wall-clock components once — they're preserved across DST.
	const match = input.dtstartLocal.match(
		/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/
	);
	if (!match) {
		throw new Error(`expandTemplate: bad dtstartLocal "${input.dtstartLocal}"`);
	}
	const [, , , , hStr, mStr] = match;
	const wallHour = +hStr;
	const wallMinute = +mStr;

	const dtstartUtc = localToUtc(input.dtstartLocal, tz);

	// rrule works in "UTC-as-local": we feed it a UTC DTSTART and interpret
	// results as UTC wall-clock, then re-anchor to the clinic tz per-occurrence.
	const rule = RRule.fromString(input.rrule + ';DTSTART=' + toRRuleDtStamp(dtstartUtc));

	// Compute an expansion window with a little slack — rrule's `between` is
	// exclusive on both ends by default so we pass `inc=true`.
	const start = input.windowStart ?? new Date(dtstartUtc.getTime() - 1);
	const end = input.windowEnd ?? new Date(dtstartUtc.getTime() + 365 * 24 * 60 * 60 * 1000);

	const raw = rule.between(start, end, true);

	const occurrences: ExpandedOccurrence[] = [];
	const durationMs = input.durationMinutes * 60 * 1000;

	for (const occ of raw) {
		// rrule returns JS Dates whose UTC fields describe the intended "floating"
		// wall-clock. Extract Y/M/D from the UTC fields and re-anchor that
		// wall-clock to the clinic tz.
		const y = occ.getUTCFullYear();
		const mo = String(occ.getUTCMonth() + 1).padStart(2, '0');
		const d = String(occ.getUTCDate()).padStart(2, '0');
		const h = String(wallHour).padStart(2, '0');
		const mi = String(wallMinute).padStart(2, '0');
		const localIso = `${y}-${mo}-${d}T${h}:${mi}`;
		const startsAt = localToUtc(localIso, tz);

		// Skip if outside the window after re-anchoring (DST shifts by an hour
		// may nudge an occurrence across the boundary).
		if (input.windowStart && startsAt < input.windowStart) continue;
		if (input.windowEnd && startsAt > input.windowEnd) continue;

		occurrences.push({
			startsAt,
			endsAt: new Date(startsAt.getTime() + durationMs)
		});
	}

	return occurrences;
}

function toRRuleDtStamp(d: Date): string {
	const y = d.getUTCFullYear();
	const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
	const day = String(d.getUTCDate()).padStart(2, '0');
	const h = String(d.getUTCHours()).padStart(2, '0');
	const mi = String(d.getUTCMinutes()).padStart(2, '0');
	const s = String(d.getUTCSeconds()).padStart(2, '0');
	return `${y}${mo}${day}T${h}${mi}${s}Z`;
}

/** Convert BYDAY tokens (e.g. ["MO","WE"]) to rrule Weekday list. */
export function bydayTokensToWeekdays(tokens: string[]): Weekday[] {
	const map: Record<string, Weekday> = {
		MO: RRule.MO,
		TU: RRule.TU,
		WE: RRule.WE,
		TH: RRule.TH,
		FR: RRule.FR,
		SA: RRule.SA,
		SU: RRule.SU
	};
	return tokens.map((t) => {
		const w = map[t.trim().toUpperCase()];
		if (!w) throw new Error(`Unknown BYDAY token "${t}"`);
		return w;
	});
}

/** Build an RRULE string from a BYDAY list. */
export function buildWeeklyRRule(byDay: string): string {
	return `FREQ=WEEKLY;BYDAY=${byDay.toUpperCase()}`;
}

// Exported for tests that want to inspect dtstart handling.
export const _internal = { tzOffsetMs };
