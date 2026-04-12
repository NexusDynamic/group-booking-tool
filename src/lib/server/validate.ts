import { z } from 'zod';
import { fail, type ActionFailure } from '@sveltejs/kit';

/**
 * Parse a SvelteKit `FormData` against a zod schema.
 *
 * Usage in a form action:
 *
 *   const parsed = parseForm(mySchema, await request.formData());
 *   if (!parsed.ok) return parsed.failure;
 *   // parsed.data is fully typed
 */
export type ParseResult<T> =
	| { ok: true; data: T }
	| {
			ok: false;
			failure: ActionFailure<{
				errors: Record<string, string>;
				values: Record<string, string>;
			}>;
	  };

export function parseForm<T extends z.ZodTypeAny>(
	schema: T,
	formData: FormData
): ParseResult<z.infer<T>> {
	const values: Record<string, string> = {};
	for (const [key, value] of formData.entries()) {
		if (typeof value === 'string') values[key] = value;
	}
	const result = schema.safeParse(values);
	if (result.success) {
		return { ok: true, data: result.data };
	}
	const errors: Record<string, string> = {};
	for (const issue of result.error.issues) {
		const path = issue.path.join('.') || '_';
		if (!errors[path]) errors[path] = issue.message;
	}
	return { ok: false, failure: fail(400, { errors, values }) };
}

/** Normalise an email for dedupe: lowercased, trimmed. */
export function normaliseEmail(raw: string): string {
	return raw.trim().toLowerCase();
}
