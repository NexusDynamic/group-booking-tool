import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import {
	bookings,
	recurrenceTemplates,
	sessions,
	type experiments as experimentsTable
} from './db/schema';
import { expandTemplate } from './recurrence';

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

	// Count confirmed bookings in a follow-up query and join in JS. Drizzle's
	// correlated sql subquery pattern returned zeros in the in-memory sqlite
	// test environment — splitting into two queries is both more portable and
	// easier to unit-test.
	const countsBySession = new Map<string, number>();
	if (rows.length > 0) {
		const bookingRows = await db
			.select({ sessionId: bookings.sessionId, status: bookings.status })
			.from(bookings)
			.where(
				inArray(
					bookings.sessionId,
					rows.map((r) => r.id)
				)
			);
		for (const b of bookingRows) {
			if (b.status === 'confirmed') {
				countsBySession.set(b.sessionId, (countsBySession.get(b.sessionId) ?? 0) + 1);
			}
		}
	}

	return rows.map((r) => ({ ...r, confirmedCount: countsBySession.get(r.id) ?? 0 }));
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
			notes: input.notes ?? ''
		})
		.returning();
	return row;
}

export async function updateSession(
	id: string,
	patch: Partial<Pick<NewSession, 'startsAt' | 'endsAt' | 'capacity' | 'minParticipants' | 'location' | 'notes' | 'status'>>
): Promise<void> {
	await db.update(sessions).set({ ...patch, updatedAt: new Date() }).where(eq(sessions.id, id));
}

export async function cancelSession(id: string): Promise<void> {
	await updateSession(id, { status: 'cancelled' });
}

export async function deleteSession(id: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, id));
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

export async function getTemplateById(id: string): Promise<RecurrenceTemplate | undefined> {
	const rows = await db
		.select()
		.from(recurrenceTemplates)
		.where(eq(recurrenceTemplates.id, id))
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
			windowStart: input.windowStart ?? null,
			windowEnd: input.windowEnd ?? null
		})
		.returning();
	return row;
}

export async function deleteTemplate(id: string): Promise<void> {
	await db.delete(recurrenceTemplates).where(eq(recurrenceTemplates.id, id));
}

/**
 * Expand a template into concrete `sessions` rows. Uses ON CONFLICT on the
 * partial unique index `(source_template_id, starts_at)` to be idempotent.
 */
export async function materialiseTemplate(templateId: string): Promise<number> {
	const template = await getTemplateById(templateId);
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
		try {
			const result = await db
				.insert(sessions)
				.values({
					experimentId: template.experimentId,
					sourceTemplateId: template.id,
					startsAt: occ.startsAt,
					endsAt: occ.endsAt,
					capacity: template.capacity,
					minParticipants: template.minParticipants
				})
				.onConflictDoNothing({
					target: [sessions.sourceTemplateId, sessions.startsAt]
				})
				.returning();
			if (result.length > 0) inserted++;
		} catch (err) {
			// On the partial unique index, onConflictDoNothing should handle it
			// but some drivers still throw — swallow and continue.
			if (!String(err).includes('UNIQUE')) throw err;
		}
	}
	return inserted;
}

/**
 * Regenerate future sessions from a template: delete any future sessions that
 * have zero bookings, then re-materialise. Never touches sessions with any
 * existing bookings, even cancelled ones (to preserve history).
 */
export async function regenerateFutureSessions(templateId: string): Promise<{
	deleted: number;
	inserted: number;
}> {
	const template = await getTemplateById(templateId);
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

// Re-export for discoverability
export type { experimentsTable };
