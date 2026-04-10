import { z } from 'zod';

const localDateTime = z
	.string()
	.trim()
	.regex(
		/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/,
		'Use format YYYY-MM-DDTHH:mm'
	);

/** Form schema for a one-off session created directly (no template). */
export const sessionFormSchema = z.object({
	startsAtLocal: localDateTime,
	durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
	capacity: z.coerce.number().int().min(1).max(1000),
	minParticipants: z.coerce.number().int().min(1).max(1000),
	location: z.string().max(200).default(''),
	notes: z.string().max(2000).default('')
});
export type SessionForm = z.infer<typeof sessionFormSchema>;

/** Form schema for a recurrence template. */
export const recurrenceTemplateFormSchema = z.object({
	label: z.string().trim().min(1).max(120),
	// Comma-separated BYDAY tokens: MO,TU,WE,TH,FR,SA,SU
	byDay: z
		.string()
		.trim()
		.min(1)
		.regex(/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/, 'Use MO,TU,... tokens'),
	dtstartLocal: localDateTime,
	durationMinutes: z.coerce.number().int().min(1).max(24 * 60),
	capacity: z.coerce.number().int().min(1).max(1000),
	minParticipants: z.coerce.number().int().min(1).max(1000),
	// ISO local date-only: YYYY-MM-DD (we interpret at midnight in clinic tz)
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
		.or(z.literal('').transform(() => undefined))
});
export type RecurrenceTemplateForm = z.infer<typeof recurrenceTemplateFormSchema>;
