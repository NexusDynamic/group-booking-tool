import { and, desc, eq, ne } from 'drizzle-orm';
import { db } from './db';
import { bookings, experiments, sessions } from './db/schema';
import { generateToken } from './tokens';
import type { ExperimentForm, RequiredField } from '$lib/schemas/experiment';
import { requiredFieldsSchema } from '$lib/schemas/experiment';

export type Experiment = typeof experiments.$inferSelect;
export type NewExperiment = typeof experiments.$inferInsert;

export async function listExperiments(): Promise<Experiment[]> {
	return db.select().from(experiments).orderBy(desc(experiments.createdAt));
}

export async function getExperimentById(id: string): Promise<Experiment | undefined> {
	const rows = await db.select().from(experiments).where(eq(experiments.id, id)).limit(1);
	return rows[0];
}

export async function getExperimentBySlug(slug: string): Promise<Experiment | undefined> {
	const rows = await db.select().from(experiments).where(eq(experiments.slug, slug)).limit(1);
	return rows[0];
}

export class SlugInUseError extends Error {
	constructor(slug: string) {
		super(`Slug "${slug}" is already in use`);
		this.name = 'SlugInUseError';
	}
}

export async function createExperiment(input: ExperimentForm): Promise<Experiment> {
	const conflict = await getExperimentBySlug(input.slug);
	if (conflict) throw new SlugInUseError(input.slug);
	const [row] = await db
		.insert(experiments)
		.values({
			slug: input.slug,
			name: input.name,
			description: input.description,
			durationMinutes: input.durationMinutes,
			inclusionCriteria: input.inclusionCriteria,
			exclusionCriteria: input.exclusionCriteria,
			minParticipants: input.minParticipants,
			maxParticipants: input.maxParticipants,
			excludePriorAttendees: input.excludePriorAttendees,
			publicIcsToken: generateToken(),
			researcherIcsToken: generateToken(),
			experimenterName: input.experimenterName,
			experimenterEmail: input.experimenterEmail,
			location: input.location
		})
		.returning();
	return row;
}

export async function updateExperiment(
	id: string,
	input: ExperimentForm
): Promise<Experiment | undefined> {
	const conflict = await db
		.select({ id: experiments.id })
		.from(experiments)
		.where(and(eq(experiments.slug, input.slug), ne(experiments.id, id)))
		.limit(1);
	if (conflict.length > 0) throw new SlugInUseError(input.slug);
	const [row] = await db
		.update(experiments)
		.set({
			slug: input.slug,
			name: input.name,
			description: input.description,
			durationMinutes: input.durationMinutes,
			inclusionCriteria: input.inclusionCriteria,
			exclusionCriteria: input.exclusionCriteria,
			minParticipants: input.minParticipants,
			maxParticipants: input.maxParticipants,
			excludePriorAttendees: input.excludePriorAttendees,
			experimenterName: input.experimenterName,
			experimenterEmail: input.experimenterEmail,
			location: input.location,
			updatedAt: new Date()
		})
		.where(eq(experiments.id, id))
		.returning();
	return row;
}

export async function setPublished(id: string, isPublished: boolean): Promise<void> {
	await db
		.update(experiments)
		.set({ isPublished, updatedAt: new Date() })
		.where(eq(experiments.id, id));
}

export async function updateRequiredFields(id: string, fields: RequiredField[]): Promise<void> {
	const validated = requiredFieldsSchema.parse(fields);
	await db
		.update(experiments)
		.set({ requiredFields: JSON.stringify(validated), updatedAt: new Date() })
		.where(eq(experiments.id, id));
}

export class ExperimentHasBookingsError extends Error {
	constructor(id: string) {
		super(`Experiment ${id} has bookings and cannot be deleted. Cancel them first.`);
		this.name = 'ExperimentHasBookingsError';
	}
}

/**
 * Soft-block delete if any booking exists on any session of this experiment.
 * Callers must cancel bookings first.
 */
export async function deleteExperiment(id: string): Promise<void> {
	const bookedRows = await db
		.select({ id: bookings.id })
		.from(bookings)
		.innerJoin(sessions, eq(bookings.sessionId, sessions.id))
		.where(eq(sessions.experimentId, id))
		.limit(1);
	if (bookedRows.length > 0) throw new ExperimentHasBookingsError(id);
	await db.delete(experiments).where(eq(experiments.id, id));
}

export async function rotateIcsToken(id: string, which: 'public' | 'researcher'): Promise<void> {
	const column = which === 'public' ? 'publicIcsToken' : 'researcherIcsToken';
	await db
		.update(experiments)
		.set({ [column]: generateToken(), updatedAt: new Date() })
		.where(eq(experiments.id, id));
}
