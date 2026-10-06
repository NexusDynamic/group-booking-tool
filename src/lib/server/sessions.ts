import { and, asc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { generateToken } from './tokens';
import { bookings, recurrenceTemplates, sessions } from './db/schema';
import { expandTemplate } from './recurrence';
import { syncSessionStatus } from './session-status';

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type RecurrenceTemplate = typeof recurrenceTemplates.$inferSelect;

/** List all sessions for an experiment, ordered by start time ascending. */
export async function listSessions(experimentId: string): Promise<Session[]> {
	return db
		.select()
		.from(sessions)
		.where(eq(sessions.experimentId, experimentId))
		.orderBy(asc(sessions.startsAt));
}

export async function getSessionById(id: string): Promise<Session | undefined> {
	const rows = await db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
	return rows[0];
}

/**
 * List sessions with a live confirmed-booking count. Returned in start-time
 * order. This is the shape consumed by both the admin sessions grid and the
 * public picker.
 */
export interface SessionWithCount extends Session {
	confirmedCount: number;
}

export async function sessionsWithCounts(
	experimentId: string,
	opts: { upcomingOnly?: boolean } = {}
): Promise<SessionWithCount[]> {
	const now = new Date();
	const whereExpr = opts.upcomingOnly
		? and(eq(sessions.experimentId, experimentId), gte(sessions.startsAt, now))
		: eq(sessions.experimentId, experimentId);

	const rows = await db.select().from(sessions).where(whereExpr).orderBy(asc(sessions.startsAt));
	const counts = await confirmedCounts(rows.map((r) => r.id));
	return rows.map((r) => ({ ...r, confirmedCount: counts.get(r.id) ?? 0 }));
}

/**
 * Confirmed-booking count per session id. Sessions without confirmed
 * bookings are absent from the map (treat as 0).
 */
export async function confirmedCounts(sessionIds: string[]): Promise<Map<string, number>> {
	if (sessionIds.length === 0) return new Map();
	const rows = await db
		.select({ sessionId: bookings.sessionId, n: sql<number>`count(*)` })
		.from(bookings)
		.where(and(inArray(bookings.sessionId, sessionIds), eq(bookings.status, 'confirmed')))
		.groupBy(bookings.sessionId);
	return new Map(rows.map((r) => [r.sessionId, Number(r.n)]));
}

export async function createOneOffSession(
	experimentId: string,
	input: {
		startsAt: Date;
		endsAt: Date;
		capacity: number;
		minParticipants: number;
		location?: string;
		notes?: string;
	}
): Promise<Session> {
	const [row] = await db
		.insert(sessions)
		.values({
			experimentId,
			startsAt: input.startsAt,
			endsAt: input.endsAt,
			capacity: input.capacity,
			minParticipants: input.minParticipants,
			location: input.location ?? '',
			notes: input.notes ?? '',
			publicIcsToken: generateToken()
		})
		.returning();
	return row;
}

/**
 * Admin mutations below take the owning `experimentId` and include it in the
 * WHERE clause, so an id belonging to a different experiment is a no-op.
 * Each returns whether a row was affected.
 */
export async function updateSession(
	id: string,
	experimentId: string,
	patch: Partial<
		Pick<
			NewSession,
			'startsAt' | 'endsAt' | 'capacity' | 'minParticipants' | 'location' | 'notes' | 'status'
		>
	>
): Promise<boolean> {
	return db.transaction((tx) => {
		const updated = tx
			.update(sessions)
			.set({ ...patch, updatedAt: new Date() })
			.where(and(eq(sessions.id, id), eq(sessions.experimentId, experimentId)))
			.returning({ id: sessions.id })
			.all();
		if (updated.length === 0) return false;
		// minParticipants may have changed which side of the threshold we're on.
		syncSessionStatus(tx, id);
		return true;
	});
}

export async function cancelSession(id: string, experimentId: string): Promise<boolean> {
	return updateSession(id, experimentId, { status: 'cancelled' });
}

export async function deleteSession(id: string, experimentId: string): Promise<boolean> {
	const deleted = await db
		.delete(sessions)
		.where(and(eq(sessions.id, id), eq(sessions.experimentId, experimentId)))
		.returning({ id: sessions.id });
	return deleted.length > 0;
}

// ---------------------------------------------------------------------------
// Recurrence templates
// ---------------------------------------------------------------------------

export async function listTemplates(experimentId: string): Promise<RecurrenceTemplate[]> {
	return db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.experimentId, experimentId))
		.orderBy(asc(recurrenceTemplates.createdAt));
}

export async function getTemplateById(
	id: string,
	experimentId?: string
): Promise<RecurrenceTemplate | undefined> {
	const rows = await db
		.select()
		.from(recurrenceTemplates)
		.where(
			experimentId === undefined
				? eq(recurrenceTemplates.id, id)
				: and(eq(recurrenceTemplates.id, id), eq(recurrenceTemplates.experimentId, experimentId))
		)
		.limit(1);
	return rows[0];
}

export async function createTemplate(input: {
	experimentId: string;
	label: string;
	rrule: string;
	dtstartLocal: string;
	durationMinutes: number;
	capacity: number;
	minParticipants: number;
	location?: string;
	notes?: string;
	windowStart?: Date | null;
	windowEnd?: Date | null;
}): Promise<RecurrenceTemplate> {
	const [row] = await db
		.insert(recurrenceTemplates)
		.values({
			experimentId: input.experimentId,
			label: input.label,
			rrule: input.rrule,
			dtstartLocal: input.dtstartLocal,
			durationMinutes: input.durationMinutes,
			capacity: input.capacity,
			minParticipants: input.minParticipants,
			location: input.location ?? '',
			notes: input.notes ?? '',
			windowStart: input.windowStart ?? null,
			windowEnd: input.windowEnd ?? null
		})
		.returning();
	return row;
}

export async function deleteTemplate(id: string, experimentId: string): Promise<boolean> {
	const deleted = await db
		.delete(recurrenceTemplates)
		.where(and(eq(recurrenceTemplates.id, id), eq(recurrenceTemplates.experimentId, experimentId)))
		.returning({ id: recurrenceTemplates.id });
	return deleted.length > 0;
}

/**
 * Expand a template into concrete `sessions` rows. Uses ON CONFLICT on the
 * partial unique index `(source_template_id, starts_at)` to be idempotent.
 */
export async function materialiseTemplate(
	templateId: string,
	experimentId?: string
): Promise<number> {
	const template = await getTemplateById(templateId, experimentId);
	if (!template) throw new Error(`template ${templateId} not found`);

	const occurrences = expandTemplate({
		rrule: template.rrule,
		dtstartLocal: template.dtstartLocal,
		durationMinutes: template.durationMinutes,
		windowStart: template.windowStart ?? undefined,
		windowEnd: template.windowEnd ?? undefined
	});

	if (occurrences.length === 0) return 0;

	let inserted = 0;
	for (const occ of occurrences) {
		// .onConflictDoNothing() without a target generates INSERT OR IGNORE,
		// which respects partial unique indexes. Specifying target columns would
		// generate ON CONFLICT(col1, col2) DO NOTHING, which SQLite rejects for
		// partial indexes ("does not match any PRIMARY KEY or UNIQUE constraint").
		const result = await db
			.insert(sessions)
			.values({
				experimentId: template.experimentId,
				sourceTemplateId: template.id,
				startsAt: occ.startsAt,
				endsAt: occ.endsAt,
				capacity: template.capacity,
				minParticipants: template.minParticipants,
				publicIcsToken: generateToken(),
				location: template.location,
				notes: template.notes
			})
			.onConflictDoNothing()
			.returning();
		if (result.length > 0) inserted++;
	}
	return inserted;
}

/**
 * Regenerate future sessions from a template: delete any future sessions that
 * have zero bookings, then re-materialise. Never touches sessions with any
 * existing bookings, even cancelled ones (to preserve history).
 */
export async function regenerateFutureSessions(
	templateId: string,
	experimentId?: string
): Promise<{
	deleted: number;
	inserted: number;
}> {
	const template = await getTemplateById(templateId, experimentId);
	if (!template) throw new Error(`template ${templateId} not found`);

	const now = new Date();

	// Find template-sourced future sessions with zero bookings (any status).
	const candidates = await db
		.select({ id: sessions.id })
		.from(sessions)
		.leftJoin(bookings, eq(bookings.sessionId, sessions.id))
		.where(
			and(
				eq(sessions.sourceTemplateId, templateId),
				gte(sessions.startsAt, now),
				isNull(bookings.id)
			)
		);

	let deleted = 0;
	for (const { id } of candidates) {
		await db.delete(sessions).where(eq(sessions.id, id));
		deleted++;
	}

	const inserted = await materialiseTemplate(templateId);
	return { deleted, inserted };
}
