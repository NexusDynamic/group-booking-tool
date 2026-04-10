import { z } from 'zod';

const localDateTime = z
	.string()
	.trim()
	.regex(
		/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
		'Use format YYYY-MM-DDTHH:mm'
	);

/**
 * Recurring-availability preference. The participant describes "I can do
 * Mondays 09:00–11:00 between date X and Y". Stored server-side as RRULE.
 */
export const recurringPreferenceFormSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().email().max(320),
	byDay: z
		.string()
		.trim()
		.min(1)
		.regex(/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/, 'Use MO,TU,... tokens'),
	dtstartLocal: localDateTime,
	durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
	windowStart: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
		.optional()
		.or(z.literal('').transform(() => undefined)),
	windowEnd: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
		.optional()
		.or(z.literal('').transform(() => undefined)),
	notes: z.string().max(2000).default(''),
	honeypot: z.string().max(0).optional().or(z.literal(''))
});
export type RecurringPreferenceForm = z.infer<typeof recurringPreferenceFormSchema>;

/**
 * Session-list preference. The participant ticks a handful of concrete
 * sessions that work for them. `sessionIds` arrives as a comma-separated
 * string because HTML checkboxes aren't easily array-typed in FormData.
 */
export const sessionListPreferenceFormSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().email().max(320),
	sessionIds: z.string().trim().min(1, 'Pick at least one session'),
	notes: z.string().max(2000).default(''),
	honeypot: z.string().max(0).optional().or(z.literal(''))
});
export type SessionListPreferenceForm = z.infer<typeof sessionListPreferenceFormSchema>;
