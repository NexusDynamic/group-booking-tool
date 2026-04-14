/**
 * GDPR data anonymisation helpers.
 *
 * Two entry points:
 *  - runAnonymizationJob        — scheduled sweep; scrubs all records whose
 *                                 per-experiment (or global) retention window
 *                                 has elapsed.
 *  - forceAnonymiseParticipant  — immediate erasure on request (Art. 17 GDPR).
 *
 * "Anonymisation" replaces PII fields with '<anonymized>' / '<anonymized:{id}>'
 * so schema constraints are preserved, then drops any additional field data.
 * Bookings and preferences are scrubbed first; once a participant has no
 * remaining unanonymised records their row is anonymised too.
 *
 * The unique constraint on participants.email_normalised is preserved by
 * substituting '<anonymized:{id}>' — the UUID is already unique per row.
 *
 * NOTE: after anonymisation the excludePriorAttendees deduplication no longer
 * works for that participant (their email is gone).  This is an intentional
 * trade-off: once the retention window passes, the researcher should have
 * recorded attendance in their own compliant system.
 */

import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import {
	bookingPreferences,
	bookings,
	experiments,
	participants,
	session as authSession,
	sessions
} from './db/schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = BetterSQLite3Database<any>;

const ANON = '<anonymized>' as const;
const MS_PER_DAY = 86_400_000;

export interface AnonymizationResult {
	bookingsAnonymised: number;
	preferencesAnonymised: number;
	participantsAnonymised: number;
	authSessionsDeleted: number;
}

/**
 * Sweep the database and anonymise every record whose retention window has
 * elapsed.  Safe to run repeatedly (fully idempotent).
 *
 * @param defaultRetentionDays Fallback used when an experiment has no
 *   per-experiment dataRetentionDays configured.  Typically read from the
 *   DATA_RETENTION_DAYS environment variable (default 90).
 */
export async function runAnonymizationJob(
	db: Db,
	opts: { defaultRetentionDays: number }
): Promise<AnonymizationResult> {
	const { defaultRetentionDays } = opts;
	const now = Date.now();

	// ── 1. Bookings ───────────────────────────────────────────────────────────
	// Eligible when the retention window has elapsed.
	// Reference date: experiment.endDate when set; falls back to session.endsAt
	// for experiments created before the endDate field was introduced.
	const unanonymisedBookings = await db
		.select({
			bookingId: bookings.id,
			sessionEndsAt: sessions.endsAt,
			experimentEndDate: experiments.endDate,
			retentionDays: experiments.dataRetentionDays
		})
		.from(bookings)
		.innerJoin(sessions, eq(bookings.sessionId, sessions.id))
		.innerJoin(experiments, eq(sessions.experimentId, experiments.id))
		.where(isNull(bookings.anonymisedAt));

	const bookingIds = unanonymisedBookings
		.filter((r) => {
			const days = r.retentionDays ?? defaultRetentionDays;
			const ref = r.experimentEndDate?.getTime() ?? r.sessionEndsAt.getTime();
			return ref + days * MS_PER_DAY <= now;
		})
		.map((r) => r.bookingId);

	if (bookingIds.length > 0) {
		await db
			.update(bookings)
			.set({
				snapshotName: ANON,
				snapshotEmail: ANON,
				snapshotFields: '{}',
				anonymisedAt: new Date(),
				updatedAt: new Date()
			})
			.where(inArray(bookings.id, bookingIds));
	}

	// ── 2. Preferences ────────────────────────────────────────────────────────
	// Reference date: experiment.endDate when set; otherwise windowEnd when
	// present; otherwise updatedAt (which changes whenever the researcher acts).
	const unanonymisedPrefs = await db
		.select({
			prefId: bookingPreferences.id,
			windowEnd: bookingPreferences.windowEnd,
			updatedAt: bookingPreferences.updatedAt,
			experimentEndDate: experiments.endDate,
			retentionDays: experiments.dataRetentionDays
		})
		.from(bookingPreferences)
		.innerJoin(experiments, eq(bookingPreferences.experimentId, experiments.id))
		.where(isNull(bookingPreferences.anonymisedAt));

	const prefIds = unanonymisedPrefs
		.filter((r) => {
			const days = r.retentionDays ?? defaultRetentionDays;
			const ref =
				r.experimentEndDate?.getTime() ?? r.windowEnd?.getTime() ?? r.updatedAt.getTime();
			return ref + days * MS_PER_DAY <= now;
		})
		.map((r) => r.prefId);

	if (prefIds.length > 0) {
		await db
			.update(bookingPreferences)
			.set({
				snapshotName: ANON,
				snapshotEmail: ANON,
				snapshotFields: '{}',
				anonymisedAt: new Date(),
				updatedAt: new Date()
			})
			.where(inArray(bookingPreferences.id, prefIds));
	}

	// ── 3. Participants ───────────────────────────────────────────────────────
	// Anonymise when the participant has no remaining unanonymised bookings or
	// preferences.  Ghost entries (no activity at all) are cleaned up once
	// the global retention window has elapsed since their creation.
	const pendingParticipants = await db
		.select({ id: participants.id, createdAt: participants.createdAt })
		.from(participants)
		.where(isNull(participants.anonymisedAt));

	const withLiveBooking = new Set(
		(
			await db
				.select({ pid: bookings.participantId })
				.from(bookings)
				.where(isNull(bookings.anonymisedAt))
		).map((r) => r.pid)
	);

	const withLivePref = new Set(
		(
			await db
				.select({ pid: bookingPreferences.participantId })
				.from(bookingPreferences)
				.where(isNull(bookingPreferences.anonymisedAt))
		).map((r) => r.pid)
	);

	// Distinguish participants who have *some* activity (all already anonymised)
	// from ghost accounts that never booked anything.
	const withAnyBooking = new Set(
		(await db.select({ pid: bookings.participantId }).from(bookings)).map((r) => r.pid)
	);
	const withAnyPref = new Set(
		(await db.select({ pid: bookingPreferences.participantId }).from(bookingPreferences)).map(
			(r) => r.pid
		)
	);

	const participantIds = pendingParticipants
		.filter((p) => {
			if (withLiveBooking.has(p.id) || withLivePref.has(p.id)) return false;
			const hasActivity = withAnyBooking.has(p.id) || withAnyPref.has(p.id);
			if (hasActivity) return true;
			// Ghost account — scrub after the global retention window.
			return p.createdAt.getTime() + defaultRetentionDays * MS_PER_DAY <= now;
		})
		.map((p) => p.id);

	// Update one-by-one so each gets its own unique '<anonymized:{id}>' email
	// (required to preserve the unique constraint on emailNormalised).
	for (const pid of participantIds) {
		await db
			.update(participants)
			.set({
				emailNormalised: `<anonymized:${pid}>`,
				displayName: null,
				anonymisedAt: new Date()
			})
			.where(eq(participants.id, pid));
	}

	// ── 4. Expired better-auth sessions ──────────────────────────────────────
	// These store ipAddress + userAgent and have zero value once expired.
	const cutoff = new Date();
	const expiredSessions = await db
		.select({ id: authSession.id })
		.from(authSession)
		.where(lte(authSession.expiresAt, cutoff));

	if (expiredSessions.length > 0) {
		await db.delete(authSession).where(lte(authSession.expiresAt, cutoff));
	}

	return {
		bookingsAnonymised: bookingIds.length,
		preferencesAnonymised: prefIds.length,
		participantsAnonymised: participantIds.length,
		authSessionsDeleted: expiredSessions.length
	};
}

/**
 * Immediately anonymise a single participant and all their associated data,
 * regardless of the configured retention window.
 *
 * Use this to fulfil Art. 17 GDPR right-to-erasure requests.
 */
export async function forceAnonymiseParticipant(db: Db, participantId: string): Promise<void> {
	await db
		.update(bookings)
		.set({
			snapshotName: ANON,
			snapshotEmail: ANON,
			snapshotFields: '{}',
			anonymisedAt: new Date(),
			updatedAt: new Date()
		})
		.where(and(eq(bookings.participantId, participantId), isNull(bookings.anonymisedAt)));

	await db
		.update(bookingPreferences)
		.set({
			snapshotName: ANON,
			snapshotEmail: ANON,
			snapshotFields: '{}',
			anonymisedAt: new Date(),
			updatedAt: new Date()
		})
		.where(
			and(
				eq(bookingPreferences.participantId, participantId),
				isNull(bookingPreferences.anonymisedAt)
			)
		);

	await db
		.update(participants)
		.set({
			emailNormalised: `<anonymized:${participantId}>`,
			displayName: null,
			anonymisedAt: new Date()
		})
		.where(eq(participants.id, participantId));
}
