import { and, asc, eq } from 'drizzle-orm';
import { db } from './db';
import { reminderRules } from './db/schema';

export type ReminderRule = typeof reminderRules.$inferSelect;

export async function listReminderRules(experimentId: string): Promise<ReminderRule[]> {
	return db
		.select()
		.from(reminderRules)
		.where(eq(reminderRules.experimentId, experimentId))
		.orderBy(asc(reminderRules.offsetMinutesBefore));
}

export async function createReminderRule(input: {
	experimentId: string;
	label: string;
	offsetMinutesBefore: number;
	condition: 'always' | 'below_minimum' | 'at_capacity';
	durationMinutes: number;
}): Promise<ReminderRule> {
	const [row] = await db.insert(reminderRules).values(input).returning();
	return row;
}

/** Scoped to `experimentId` so a rule id from another experiment is a no-op. */
export async function deleteReminderRule(id: string, experimentId: string): Promise<void> {
	await db
		.delete(reminderRules)
		.where(and(eq(reminderRules.id, id), eq(reminderRules.experimentId, experimentId)));
}
