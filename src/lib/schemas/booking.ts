import { z } from 'zod';
import type { RequiredField } from './experiment';

/**
 * Core booking identity — every public booking form carries these plus any
 * experiment-specific required fields.
 *
 * `honeypot` is a hidden field name expected to be empty; if a bot fills it we
 * reject. `startedAt` is an ISO timestamp set by the browser when the form
 * first renders — we use it to enforce a minimum typing time (anti-bot).
 */
export const baseBookingSchema = z.object({
	name: z.string().trim().min(1, 'Name is required').max(200),
	email: z.string().trim().email('Invalid email').max(320),
	honeypot: z.string().max(0).optional().or(z.literal('')),
	startedAt: z.string().optional()
});
export type BaseBooking = z.infer<typeof baseBookingSchema>;

/**
 * Dynamically build a zod schema that merges the base booking fields with
 * the experiment-specific required fields. Called fresh on each request.
 */
export function bookingSchemaFor(fields: RequiredField[]) {
	const extra: Record<string, z.ZodTypeAny> = {};
	for (const f of fields) {
		let rule: z.ZodTypeAny;
		switch (f.type) {
			case 'email':
				rule = z.string().trim().email(`${f.label} must be an email`).max(320);
				break;
			case 'number':
				rule = z.coerce.number({ message: `${f.label} must be a number` });
				break;
			case 'checkbox':
				rule = z
					.union([z.literal('on'), z.literal('true'), z.literal('')])
					.transform((v) => v === 'on' || v === 'true');
				break;
			default:
				rule = z.string().trim().max(2000);
		}
		if (!f.required) rule = rule.optional().or(z.literal(''));
		else if (f.type !== 'number' && f.type !== 'checkbox') {
			rule = (rule as z.ZodString).min(1, `${f.label} is required`);
		}
		extra[`field_${f.key}`] = rule;
	}
	return baseBookingSchema.extend(extra);
}
