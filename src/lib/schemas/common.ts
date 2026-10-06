import { z } from 'zod';

/**
 * Field schemas shared by several forms. Everything arrives from `FormData`
 * as a string, so numeric fields coerce.
 */

/** Wall-clock datetime as produced by `<input type="datetime-local">`. */
export const LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/;

export const localDateTime = z
	.string()
	.trim()
	.regex(LOCAL_DATETIME_RE, 'Use format YYYY-MM-DDTHH:mm');

/** Optional `<input type="date">` value; blank becomes `undefined`. */
export const optionalDate = z
	.string()
	.trim()
	.regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
	.optional()
	.or(z.literal('').transform(() => undefined));

/** Comma-separated RFC 5545 BYDAY tokens: MO,TU,WE,TH,FR,SA,SU */
export const byDay = z
	.string()
	.trim()
	.min(1)
	.regex(/^(MO|TU|WE|TH|FR|SA|SU)(,(MO|TU|WE|TH|FR|SA|SU))*$/, 'Use MO,TU,... tokens');

/** Session length in minutes, up to a day. */
export const durationMinutes = z.coerce
	.number()
	.int()
	.min(1)
	.max(24 * 60);

/** Capacity / minimum-participants style count. */
export const participantCount = z.coerce.number().int().min(1).max(1000);

/** Checkbox: present ('on' / 'true') or absent. */
export const asBool = z
	.union([z.literal('on'), z.literal('true'), z.literal(''), z.undefined()])
	.transform((v) => v === 'on' || v === 'true');

/** Hidden anti-bot field that real users leave empty. */
export const honeypot = z.string().max(0).optional().or(z.literal(''));

/** A group can never reach a minimum that is above its maximum. */
export const MIN_ABOVE_MAX_ISSUE = {
	message: 'Minimum cannot exceed the maximum',
	path: ['minParticipants']
};
