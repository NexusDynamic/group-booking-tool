import { z } from 'zod';
import { byDay, durationMinutes, honeypot, localDateTime, optionalDate } from './common';

/**
 * Recurring-availability preference. The participant describes "I can do
 * Mondays 09:00–11:00 between date X and Y". Stored server-side as RRULE.
 */
export const recurringPreferenceFormSchema = z.object({
	name: z.string().trim().min(1).max(200),
	email: z.string().trim().email().max(320),
	byDay,
	dtstartLocal: localDateTime,
	durationMinutes,
	windowStart: optionalDate,
	windowEnd: optionalDate,
	notes: z.string().max(2000).default(''),
	honeypot
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
	honeypot
});
export type SessionListPreferenceForm = z.infer<typeof sessionListPreferenceFormSchema>;
