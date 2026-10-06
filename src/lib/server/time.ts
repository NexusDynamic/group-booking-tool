import { CLINIC_TZ as ENV_CLINIC_TZ, CLINIC_LOCALE as ENV_CLINIC_LOCALE } from '$app/env/private';
import { LOCAL_DATETIME_RE } from '#lib/schemas/common.js';

/**
 * Clinic timezone used for all wall-clock display and recurrence expansion.
 * All instants in the database are stored as UTC epoch ms; this is purely a
 * presentation / wall-clock authoring concern.
 */
export const CLINIC_TZ = ENV_CLINIC_TZ || 'Europe/Copenhagen';

/**
 * Locale used for all wall-clock display (formatInTz). Accepts any BCP 47
 * locale string. Defaults to da-DK (Danish).
 */
export const CLINIC_LOCALE = ENV_CLINIC_LOCALE || 'da-DK';

export interface WallClock {
	year: number;
	month: number; // 1-12
	day: number;
	hour: number;
	minute: number;
	second: number;
}

/** Parse "YYYY-MM-DDTHH:mm[:ss]" into its wall-clock components. */
export function parseLocalDateTime(isoLocal: string): WallClock {
	const match = isoLocal.match(LOCAL_DATETIME_RE);
	if (!match) {
		throw new Error(`expected "YYYY-MM-DDTHH:mm[:ss]", got "${isoLocal}"`);
	}
	const [, y, mo, d, h, mi, s] = match;
	return { year: +y, month: +mo, day: +d, hour: +h, minute: +mi, second: s ? +s : 0 };
}

/** Wall-clock components of an instant as seen in the given IANA tz. */
export function tzParts(instant: number | Date, tz: string = CLINIC_TZ): WallClock {
	const date = instant instanceof Date ? instant : new Date(instant);
	const dtf = new Intl.DateTimeFormat('en-US', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
	const parts = Object.fromEntries(dtf.formatToParts(date).map((p) => [p.type, p.value])) as Record<
		string,
		string
	>;
	return {
		year: +parts.year,
		month: +parts.month,
		day: +parts.day,
		// Some ICU versions render midnight as "24" with hour12: false.
		hour: +parts.hour === 24 ? 0 : +parts.hour,
		minute: +parts.minute,
		second: +parts.second
	};
}

/**
 * Convert an ISO-like local datetime (e.g. "2026-06-01T09:00") interpreted in
 * a given IANA timezone to a UTC Date. Uses Intl to resolve the offset — no
 * external dep required.
 *
 * The approach: format a UTC probe of the same wall-clock in the target TZ,
 * compute the offset, then subtract it.
 */
export function localToUtc(isoLocal: string, tz: string = CLINIC_TZ): Date {
	const w = parseLocalDateTime(isoLocal);
	// Probe: treat the wall-clock as if it were UTC, then compute what that
	// instant looks like in the target tz, and use the delta as the offset.
	const probe = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
	const offsetMs = tzOffsetMs(probe, tz);
	return new Date(probe - offsetMs);
}

/**
 * Returns the offset (ms) of the given instant in the given IANA tz.
 * Positive east of UTC. e.g. Europe/Copenhagen in summer ≈ +7_200_000.
 */
export function tzOffsetMs(instant: number | Date, tz: string = CLINIC_TZ): number {
	const date = instant instanceof Date ? instant : new Date(instant);
	const w = tzParts(date, tz);
	const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
	return asUtc - date.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Format an instant as "YYYY-MM-DDTHH:mm" in the clinic tz, for datetime-local inputs. */
export function toClinicTzInput(instant: number | Date, tz: string = CLINIC_TZ): string {
	const w = tzParts(instant, tz);
	return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

/** Today's date (YYYY-MM-DD) in the clinic timezone. */
export function todayInClinicTz(tz: string = CLINIC_TZ): string {
	const w = tzParts(new Date(), tz);
	return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** Midnight at the start of a local date (YYYY-MM-DD) — inclusive window start. */
export function startOfDayUtc(dateStr: string | undefined, tz: string = CLINIC_TZ): Date | null {
	if (!dateStr) return null;
	return localToUtc(`${dateStr}T00:00`, tz);
}

/**
 * End-of-day on a local date (YYYY-MM-DD) — inclusive window end. Midnight
 * would exclude sessions that take place on the end date itself.
 */
export function endOfDayUtc(dateStr: string | undefined, tz: string = CLINIC_TZ): Date | null {
	if (!dateStr) return null;
	return localToUtc(`${dateStr}T23:59:59`, tz);
}

/** Format an instant for display in the clinic timezone. */
export function formatInTz(
	instant: number | Date,
	tz: string = CLINIC_TZ,
	options: Intl.DateTimeFormatOptions = {
		dateStyle: 'medium',
		timeStyle: 'short'
	}
): string {
	const date = instant instanceof Date ? instant : new Date(instant);
	return new Intl.DateTimeFormat(CLINIC_LOCALE, { ...options, timeZone: tz }).format(date);
}
