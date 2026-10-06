import { z } from 'zod';
import {
	byDay,
	durationMinutes,
	localDateTime,
	MIN_ABOVE_MAX_ISSUE,
	optionalDate,
	participantCount
} from './common';

const minWithinCapacity = (v: { minParticipants: number; capacity: number }) =>
	v.minParticipants <= v.capacity;

/** Form schema for a one-off session created directly (no template). */
export const sessionFormSchema = z
	.object({
		startsAtLocal: localDateTime,
		durationMinutes,
		capacity: participantCount,
		minParticipants: participantCount,
		location: z.string().max(1000).default(''),
		notes: z.string().max(5000).default('')
	})
	.refine(minWithinCapacity, MIN_ABOVE_MAX_ISSUE);
export type SessionForm = z.infer<typeof sessionFormSchema>;

/** Form schema for a recurrence template. */
export const recurrenceTemplateFormSchema = z
	.object({
		label: z.string().trim().min(1).max(120),
		byDay,
		// Wall-clock time only (HH:mm); the date part is derived from windowStart or today
		timeLocal: z
			.string()
			.trim()
			.regex(/^\d{2}:\d{2}$/, 'Use HH:mm format'),
		durationMinutes,
		capacity: participantCount,
		minParticipants: participantCount,
		location: z.string().max(1000).default(''),
		notes: z.string().max(5000).default(''),
		// ISO local date-only: YYYY-MM-DD (we interpret at midnight in clinic tz)
		windowStart: optionalDate,
		windowEnd: optionalDate
	})
	.refine(minWithinCapacity, MIN_ABOVE_MAX_ISSUE);
export type RecurrenceTemplateForm = z.infer<typeof recurrenceTemplateFormSchema>;
