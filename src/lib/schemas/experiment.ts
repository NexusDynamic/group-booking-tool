import { z } from 'zod';

/**
 * Required-field definition for participant signup forms.
 * Stored as JSON in `experiments.required_fields`.
 */
export const requiredFieldSchema = z.object({
	key: z
		.string()
		.min(1)
		.max(40)
		.regex(/^[a-z][a-z0-9_]*$/, 'Key must be snake_case starting with a letter'),
	label: z.string().min(1).max(120),
	type: z.enum(['text', 'email', 'number', 'checkbox']),
	required: z.boolean().default(false)
});
export type RequiredField = z.infer<typeof requiredFieldSchema>;

export const requiredFieldsSchema = z.array(requiredFieldSchema).max(20);

/**
 * Form schema for creating/updating an experiment.
 * All fields arrive as strings from FormData; coerce where needed.
 */
const asBool = z
	.union([z.literal('on'), z.literal('true'), z.literal(''), z.undefined()])
	.transform((v) => v === 'on' || v === 'true');

export const experimentFormSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	slug: z
		.string()
		.trim()
		.min(1, 'Slug is required')
		.max(80)
		.regex(/^[a-z0-9][a-z0-9-]*$/, 'Use lowercase letters, digits, and hyphens'),
	description: z.string().max(5000).default(''),
	experimenterName: z.string().max(100).default('Experimenter'),
	experimenterEmail: z.email().max(100).default('experimenter@example.com'),
	durationMinutes: z.coerce
		.number()
		.int()
		.min(1)
		.max(24 * 60),
	inclusionCriteria: z.string().max(5000).default(''),
	exclusionCriteria: z.string().max(5000).default(''),
	minParticipants: z.coerce.number().int().min(1).max(1000),
	maxParticipants: z.coerce.number().int().min(1).max(1000),
	location: z.string().max(1000).default(''),
	notes: z.string().max(5000).default(''),
	excludePriorAttendees: asBool
});
export type ExperimentForm = z.infer<typeof experimentFormSchema>;

/** Parse the required_fields JSON blob from the DB. Tolerant of bad data. */
export function parseRequiredFields(raw: string): RequiredField[] {
	try {
		const parsed = JSON.parse(raw);
		const result = requiredFieldsSchema.safeParse(parsed);
		return result.success ? result.data : [];
	} catch {
		return [];
	}
}
