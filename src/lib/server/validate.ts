import { z } from 'zod';
import { fail, type ActionFailure } from '@sveltejs/kit';

/** Collect the string entries of a `FormData` (files are ignored). */
export function formValues(formData: FormData): Record<string, string> {
	const values: Record<string, string> = {};
	for (const [key, value] of formData.entries()) {
		if (typeof value === 'string') values[key] = value;
	}
	return values;
}

/**
 * Flatten zod issues to one message per field, keyed by dotted path.
 * Form-level issues (empty path) land under `_`.
 */
export function zodErrors(error: z.ZodError): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of error.issues) {
		const path = issue.path.join('.') || '_';
		if (!errors[path]) errors[path] = issue.message;
	}
	return errors;
}

/** Read a single id-like string field; '' when absent. */
export function formId(formData: FormData, key = 'id'): string {
	const value = formData.get(key);
	return typeof value === 'string' ? value : '';
}

/**
 * Parse a SvelteKit `FormData` against a zod schema.
 *
 * Usage in a form action:
 *
 *   const parsed = parseForm(mySchema, await request.formData());
 *   if (!parsed.ok) return parsed.failure;
 *   // parsed.data is fully typed
 *
 * `extra` is merged into the failure payload, for state the page needs to
 * restore alongside `errors` / `values`.
 */
export type ParseResult<T, E = unknown> =
	| { ok: true; data: T; values: Record<string, string> }
	| {
			ok: false;
			failure: ActionFailure<
				{
					errors: Record<string, string>;
					values: Record<string, string>;
				} & E
			>;
	  };

export function parseForm<T extends z.ZodTypeAny, E extends object = object>(
	schema: T,
	formData: FormData,
	extra?: E
): ParseResult<z.infer<T>, E> {
	const values = formValues(formData);
	const result = schema.safeParse(values);
	if (result.success) {
		return { ok: true, data: result.data, values };
	}
	return {
		ok: false,
		failure: fail(400, { errors: zodErrors(result.error), values, ...(extra as E) })
	};
}

/** Normalise an email for dedupe: lowercased, trimmed. */
export function normaliseEmail(raw: string): string {
	return raw.trim().toLowerCase();
}
