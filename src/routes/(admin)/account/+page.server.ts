import { fail } from '@sveltejs/kit';
import { z } from 'zod';
import { auth } from '#lib/server/auth.js';
import { zodErrors } from '#lib/server/validate.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	return { user: locals.user! };
};

const changePasswordSchema = z
	.object({
		currentPassword: z.string().min(1, 'Current password is required'),
		newPassword: z.string().min(8, 'New password must be at least 8 characters'),
		confirmPassword: z.string()
	})
	.refine((v) => v.newPassword === v.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword']
	});

export const actions: Actions = {
	changePassword: async ({ request }) => {
		const formData = await request.formData();
		const values = {
			currentPassword: String(formData.get('currentPassword') ?? ''),
			newPassword: String(formData.get('newPassword') ?? ''),
			confirmPassword: String(formData.get('confirmPassword') ?? '')
		};
		const parsed = changePasswordSchema.safeParse(values);
		if (!parsed.success) return fail(400, { errors: zodErrors(parsed.error) });

		try {
			await auth.api.changePassword({
				headers: request.headers,
				body: {
					currentPassword: parsed.data.currentPassword,
					newPassword: parsed.data.newPassword
				}
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to change password';
			return fail(400, { errors: { _: message } as Record<string, string> });
		}
		return { changed: true };
	}
};
