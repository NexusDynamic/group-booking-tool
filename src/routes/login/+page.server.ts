import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import { auth } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) {
		const next = url.searchParams.get('next') || '/dashboard';
		throw redirect(303, next);
	}
	return { next: url.searchParams.get('next') || '/dashboard' };
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';
		const next = formData.get('next')?.toString() || '/dashboard';

		if (!email || !password) {
			return fail(400, { email, error: 'Email and password are required.' });
		}

		try {
			await auth.api.signInEmail({
				body: { email, password },
				headers: request.headers
			});
		} catch (err) {
			if (err instanceof APIError) {
				return fail(400, { email, error: 'Invalid email or password.' });
			}
			return fail(500, { email, error: 'Unexpected error during sign-in.' });
		}

		const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
		throw redirect(303, safeNext);
	}
};
