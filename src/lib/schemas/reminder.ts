import { z } from 'zod';
import { durationMinutes } from './common';

export const reminderRuleFormSchema = z.object({
	label: z.string().trim().min(1).max(200),
	offsetMinutesBefore: z.coerce
		.number()
		.int()
		.min(0)
		.max(60 * 24 * 30),
	condition: z.enum(['always', 'below_minimum', 'at_capacity']),
	durationMinutes
});
export type ReminderRuleForm = z.infer<typeof reminderRuleFormSchema>;
