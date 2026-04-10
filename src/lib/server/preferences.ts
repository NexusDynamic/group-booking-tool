import { and, asc, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from './db';
import { bookingPreferences, sessions } from './db/schema';
import { createBooking, upsertParticipant } from './bookings';
import { generateToken, hashToken } from './tokens';
import { expandTemplate } from './recurrence';
import { CLINIC_TZ } from './time';

export type BookingPreference = typeof bookingPreferences.$inferSelect;

export interface CreateRecurringPreferenceInput {
	experimentId: string;
	name: string;
	email: string;
	rrule: string;
	dtstartLocal: string;
	durationMinutes: number;
	windowStart?: Date | null;
	windowEnd?: Date | null;
	notes: string;
	snapshotFields?: Record<string, unknown>;
}

export interface CreateSessionListPreferenceInput {
	experimentId: string;
	name: string;
	email: string;
	sessionIds: string[];
	notes: string;
	snapshotFields?: Record<string, unknown>;
}

export interface PreferenceCreateResult {
	preference: BookingPreference;
	rawToken: string;
}

/**
 * Create a "standing availability" preference. The researcher triages these
 * from the admin preferences page and explicitly assigns them to concrete
 * sessions — we never auto-book.
 */
export async function createRecurringPreference(
	input: CreateRecurringPreferenceInput
): Promise<PreferenceCreateResult> {
	const participant = await upsertParticipant({ email: input.email, displayName: input.name });
	const rawToken = generateToken();
	const manageTokenHash = hashToken(rawToken);

	const [preference] = await db
		.insert(bookingPreferences)
		.values({
			experimentId: input.experimentId,
			participantId: participant.id,
			snapshotName: input.name,
			snapshotEmail: input.email,
			snapshotFields: JSON.stringify(input.snapshotFields ?? {}),
			kind: 'recurring',
			rrule: input.rrule,
			dtstartLocal: input.dtstartLocal,
			durationMinutes: input.durationMinutes,
			windowStart: input.windowStart ?? null,
			windowEnd: input.windowEnd ?? null,
			manageTokenHash
		})
		.returning();

	return { preference, rawToken };
}

export async function createSessionListPreference(
	input: CreateSessionListPreferenceInput
): Promise<PreferenceCreateResult> {
	const participant = await upsertParticipant({ email: input.email, displayName: input.name });
	const rawToken = generateToken();
	const manageTokenHash = hashToken(rawToken);

	const [preference] = await db
		.insert(bookingPreferences)
		.values({
			experimentId: input.experimentId,
			participantId: participant.id,
			snapshotName: input.name,
			snapshotEmail: input.email,
			snapshotFields: JSON.stringify(input.snapshotFields ?? {}),
			kind: 'session_list',
			preferredSessionIds: JSON.stringify(input.sessionIds),
			manageTokenHash
		})
		.returning();

	return { preference, rawToken };
}

export async function listPreferencesForExperiment(
	experimentId: string,
	opts: { status?: BookingPreference['status'] } = {}
): Promise<BookingPreference[]> {
	const where = opts.status
		? and(eq(bookingPreferences.experimentId, experimentId), eq(bookingPreferences.status, opts.status))
		: eq(bookingPreferences.experimentId, experimentId);
	return db.select().from(bookingPreferences).where(where).orderBy(desc(bookingPreferences.createdAt));
}

export async function getPreferenceById(id: string): Promise<BookingPreference | undefined> {
	const rows = await db
		.select()
		.from(bookingPreferences)
		.where(eq(bookingPreferences.id, id))
		.limit(1);
	return rows[0];
}

export async function findPreferenceByToken(
	rawToken: string
): Promise<BookingPreference | undefined> {
	const rows = await db
		.select()
		.from(bookingPreferences)
		.where(eq(bookingPreferences.manageTokenHash, hashToken(rawToken)))
		.limit(1);
	return rows[0];
}

export async function withdrawPreferenceByToken(rawToken: string): Promise<void> {
	const pref = await findPreferenceByToken(rawToken);
	if (!pref) return;
	if (pref.status !== 'pending') return;
	await db
		.update(bookingPreferences)
		.set({ status: 'withdrawn', updatedAt: new Date() })
		.where(eq(bookingPreferences.id, pref.id));
}

/**
 * Given a preference row, return candidate future sessions that match it.
 *
 * For `recurring` preferences: we expand the RRULE across the preference's
 * window (or a 60-day default lookahead) and intersect those wall-clock
 * instants with existing `scheduled` sessions on the experiment. A session
 * matches when its `startsAt` is within 1 minute of a preferred instant.
 *
 * For `session_list` preferences: just fetch those session ids.
 */
export async function suggestMatchingSessions(
	pref: BookingPreference
): Promise<Array<{ id: string; startsAt: Date; endsAt: Date; capacity: number }>> {
	const now = new Date();

	if (pref.kind === 'session_list') {
		const ids = parseSessionIds(pref.preferredSessionIds);
		if (ids.length === 0) return [];
		const rows = await db
			.select({
				id: sessions.id,
				startsAt: sessions.startsAt,
				endsAt: sessions.endsAt,
				capacity: sessions.capacity,
				status: sessions.status
			})
			.from(sessions)
			.where(
				and(
					inArray(sessions.id, ids),
					eq(sessions.experimentId, pref.experimentId),
					gte(sessions.startsAt, now)
				)
			)
			.orderBy(asc(sessions.startsAt));
		return rows.filter((r) => r.status === 'scheduled');
	}

	// recurring: expand rrule.
	if (!pref.rrule || !pref.dtstartLocal || !pref.durationMinutes) return [];
	const windowStart = pref.windowStart ?? now;
	const windowEnd =
		pref.windowEnd ?? new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

	const expanded = expandTemplate({
		rrule: pref.rrule,
		dtstartLocal: pref.dtstartLocal,
		durationMinutes: pref.durationMinutes,
		windowStart,
		windowEnd,
		tz: CLINIC_TZ
	});
	if (expanded.length === 0) return [];

	// Find scheduled sessions within the window for this experiment.
	const candidates = await db
		.select({
			id: sessions.id,
			startsAt: sessions.startsAt,
			endsAt: sessions.endsAt,
			capacity: sessions.capacity,
			status: sessions.status
		})
		.from(sessions)
		.where(
			and(
				eq(sessions.experimentId, pref.experimentId),
				gte(sessions.startsAt, windowStart)
			)
		)
		.orderBy(asc(sessions.startsAt));

	const expandedMs = new Set(expanded.map((e) => e.startsAt.getTime()));
	const tolerance = 60 * 1000; // ±1 minute

	return candidates.filter((c) => {
		if (c.status !== 'scheduled') return false;
		const t = new Date(c.startsAt).getTime();
		if (expandedMs.has(t)) return true;
		for (const ms of expandedMs) {
			if (Math.abs(ms - t) <= tolerance) return true;
		}
		return false;
	});
}

/**
 * Admin action: promote a preference into real bookings on specific sessions.
 *
 * We create one `bookings` row per session via the normal `createBooking`
 * path (so capacity checks still fire), then mark the preference as
 * `assigned`. If any booking fails the preference stays pending and the
 * already-created bookings remain — the researcher can retry on a different
 * session set.
 */
export async function assignPreferenceToSessions(
	preferenceId: string,
	sessionIds: string[]
): Promise<{ created: number; errors: Array<{ sessionId: string; message: string }> }> {
	const pref = await getPreferenceById(preferenceId);
	if (!pref) throw new Error(`preference ${preferenceId} not found`);
	if (pref.status !== 'pending') {
		throw new Error(`preference ${preferenceId} is ${pref.status}, not pending`);
	}

	let created = 0;
	const errors: Array<{ sessionId: string; message: string }> = [];
	for (const sessionId of sessionIds) {
		try {
			await createBooking({
				sessionId,
				participantId: pref.participantId,
				snapshotName: pref.snapshotName,
				snapshotEmail: pref.snapshotEmail,
				snapshotFields: JSON.parse(pref.snapshotFields || '{}')
			});
			created++;
		} catch (err) {
			errors.push({ sessionId, message: err instanceof Error ? err.message : String(err) });
		}
	}

	if (created > 0) {
		await db
			.update(bookingPreferences)
			.set({ status: 'assigned', updatedAt: new Date() })
			.where(eq(bookingPreferences.id, preferenceId));
	}

	return { created, errors };
}

export async function declinePreference(preferenceId: string): Promise<void> {
	await db
		.update(bookingPreferences)
		.set({ status: 'declined', updatedAt: new Date() })
		.where(eq(bookingPreferences.id, preferenceId));
}

function parseSessionIds(raw: string | null): string[] {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
	} catch {
		// fall through
	}
	return [];
}
