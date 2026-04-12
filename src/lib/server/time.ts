import { env } from '$env/dynamic/private';

/**
 * Clinic timezone used for all wall-clock display and recurrence expansion.
 * All instants in the database are stored as UTC epoch ms; this is purely a
 * presentation / wall-clock authoring concern.
 */
export const CLINIC_TZ = env.CLINIC_TZ || 'Europe/Copenhagen';

/**
 * Convert an ISO-like local datetime (e.g. "2026-06-01T09:00") interpreted in
 * a given IANA timezone to a UTC Date. Uses Intl to resolve the offset — no
 * external dep required.
 *
 * The approach: format a UTC probe of the same wall-clock in the target TZ,
 * compute the offset, then subtract it.
 */
export function localToUtc(isoLocal: string, tz: string = CLINIC_TZ): Date {
	const match = isoLocal.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
	if (!match) {
		throw new Error(`localToUtc: expected "YYYY-MM-DDTHH:mm[:ss]", got "${isoLocal}"`);
	}
	const [, y, mo, d, h, mi, s] = match;
	// Probe: treat the wall-clock as if it were UTC, then compute what that
	// instant looks like in the target tz, and use the delta as the offset.
	const probe = Date.UTC(+y, +mo - 1, +d, +h, +mi, s ? +s : 0);
	const offsetMs = tzOffsetMs(probe, tz);
	return new Date(probe - offsetMs);
}

/**
 * Returns the offset (ms) of the given instant in the given IANA tz.
 * Positive east of UTC. e.g. Europe/Copenhagen in summer ≈ +7_200_000.
 */
export function tzOffsetMs(instant: number | Date, tz: string = CLINIC_TZ): number {
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
	const asUtc = Date.UTC(
		+parts.year,
		+parts.month - 1,
		+parts.day,
		+parts.hour === 24 ? 0 : +parts.hour,
		+parts.minute,
		+parts.second
	);
	return asUtc - date.getTime();
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
	return new Intl.DateTimeFormat('en-GB', { ...options, timeZone: tz }).format(date);
}
