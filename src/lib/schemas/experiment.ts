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
	excludePriorAttendees: asBool,
	// Experiment end date — required for the GDPR retention window.
	// The anonymization job uses (endDate + retentionDays) as the deletion anchor.
	// Empty / absent = null (experiment still ongoing; no data will be deleted).
	endDate: z
		.preprocess(
			(v) => {
				if (v === '' || v === undefined || v === null) return null;
				return v;
			},
			z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').nullable()
		)
		.default(null),
	// GDPR: days to retain participant data after experiment end date.
	// Empty / absent = use the server-wide DATA_RETENTION_DAYS default.
	dataRetentionDays: z.preprocess(
		(v) => {
			if (v === '' || v === undefined || v === null) return null;
			const n = Number(v);
			return Number.isFinite(n) ? n : null;
		},
		z.number().int().min(1, 'Must be at least 1 day').max(3650, '10 years maximum').nullable()
	),
	// Free-text Art. 13 notice shown to participants at sign-up.
	privacyNoticeText: z.string().max(2000).default(''),
	// Optional URL to a full privacy policy page.
	privacyNoticeUrl: z.string().max(500).default('')
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
