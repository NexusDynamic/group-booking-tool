import { and, asc, desc, eq, gte, inArray, or } from 'drizzle-orm';
import { db } from './db';
import { bookingPreferences, bookings, experiments, participants, sessions } from './db/schema';

/**
 * Dashboard stats + upcoming activity feed. Shape is tailored for the
 * `(admin)/dashboard` load — a single call gives the page everything it
 * needs so the component stays dumb.
 */

export interface UpcomingSessionRow {
	id: string;
	experimentId: string;
	experimentName: string;
	experimentSlug: string;
	startsAt: Date;
	endsAt: Date;
	capacity: number;
	minParticipants: number;
	confirmedCount: number;
	belowMinimum: boolean;
	full: boolean;
}

export interface DashboardData {
	counts: {
		experiments: number;
		publishedExperiments: number;
		upcomingSessions: number;
		belowMinimum: number;
		pendingPreferences: number;
	};
	upcoming: UpcomingSessionRow[];
}

/**
 * Single aggregated load for the admin dashboard. We fetch scheduled future
 * sessions, join confirmed counts in JS, and also return summary counters
 * used by the top cards.
 */
export async function loadDashboard(opts: { upcomingLimit?: number } = {}): Promise<DashboardData> {
	const upcomingLimit = opts.upcomingLimit ?? 10;
	const now = new Date();

	const expRows = await db.select().from(experiments);
	const expById = new Map(expRows.map((e) => [e.id, e]));

	const sessionRows = await db
		.select()
		.from(sessions)
		.where(
			and(
				gte(sessions.startsAt, now),
				or(eq(sessions.status, 'scheduled'), eq(sessions.status, 'confirmed'))
			)
		)
		.orderBy(asc(sessions.startsAt));

	const countsBySession = new Map<string, number>();
	if (sessionRows.length > 0) {
		const bookingRows = await db
			.select({ sessionId: bookings.sessionId, status: bookings.status })
			.from(bookings)
			.where(
				inArray(
					bookings.sessionId,
					sessionRows.map((s) => s.id)
				)
			);
		for (const b of bookingRows) {
			if (b.status === 'confirmed') {
				countsBySession.set(b.sessionId, (countsBySession.get(b.sessionId) ?? 0) + 1);
			}
		}
	}

	const enriched: UpcomingSessionRow[] = sessionRows.flatMap((s) => {
		const exp = expById.get(s.experimentId);
		if (!exp) return [];
		const confirmedCount = countsBySession.get(s.id) ?? 0;
		return [
			{
				id: s.id,
				experimentId: s.experimentId,
				experimentName: exp.name,
				experimentSlug: exp.slug,
				startsAt: s.startsAt,
				endsAt: s.endsAt,
				capacity: s.capacity,
				minParticipants: s.minParticipants,
				confirmedCount,
				belowMinimum: confirmedCount < s.minParticipants,
				full: confirmedCount >= s.capacity
			}
		];
	});

	const pendingPrefRows = await db
		.select({ id: bookingPreferences.id })
		.from(bookingPreferences)
		.where(eq(bookingPreferences.status, 'pending'));

	return {
		counts: {
			experiments: expRows.length,
			publishedExperiments: expRows.filter((e) => e.isPublished).length,
			upcomingSessions: enriched.length,
			belowMinimum: enriched.filter((r) => r.belowMinimum).length,
			pendingPreferences: pendingPrefRows.length
		},
		upcoming: enriched.slice(0, upcomingLimit)
	};
}

/**
 * Global participants list with per-participant attendance tally across all
 * experiments. Ordered by most-recently-active first.
 */
export interface ParticipantSummary {
	id: string;
	email: string;
	displayName: string | null;
	confirmedCount: number;
	attendedCount: number;
	noShowCount: number;
	cancelledCount: number;
	lastBookingAt: Date | null;
	anonymisedAt: Date | null;
}

export async function listParticipantsWithActivity(): Promise<ParticipantSummary[]> {
	// Join participants so we pick up anonymisedAt; aggregate booking stats in JS.
	const rows = await db
		.select({
			bookingId: bookings.id,
			participantId: bookings.participantId,
			status: bookings.status,
			snapshotEmail: bookings.snapshotEmail,
			snapshotName: bookings.snapshotName,
			createdAt: bookings.createdAt,
			anonymisedAt: participants.anonymisedAt
		})
		.from(bookings)
		.innerJoin(participants, eq(bookings.participantId, participants.id))
		.orderBy(desc(bookings.createdAt));

	type Agg = ParticipantSummary;
	const byParticipant = new Map<string, Agg>();
	for (const r of rows) {
		let agg = byParticipant.get(r.participantId);
		if (!agg) {
			agg = {
				id: r.participantId,
				email: r.snapshotEmail,
				displayName: r.snapshotName,
				confirmedCount: 0,
				attendedCount: 0,
				noShowCount: 0,
				cancelledCount: 0,
				lastBookingAt: null,
				anonymisedAt: r.anonymisedAt
			};
			byParticipant.set(r.participantId, agg);
		}
		if (r.status === 'confirmed') agg.confirmedCount++;
		else if (r.status === 'attended') agg.attendedCount++;
		else if (r.status === 'no_show') agg.noShowCount++;
		else if (r.status === 'cancelled') agg.cancelledCount++;
		if (!agg.lastBookingAt || r.createdAt > agg.lastBookingAt) {
			agg.lastBookingAt = r.createdAt;
		}
	}

	return Array.from(byParticipant.values()).sort((a, b) => {
		const at = a.lastBookingAt?.getTime() ?? 0;
		const bt = b.lastBookingAt?.getTime() ?? 0;
		return bt - at;
	});
}
