import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { APIError } from 'better-auth/api';
import { auth } from '#lib/server/auth.js';
import { clientIp } from '#lib/server/guards.js';
import { LOGIN_LIMIT, rateLimit } from '#lib/server/rate-limit.js';
import { TRUSTED_PROXY } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) {
		throw redirect(303, resolve('dashboard'));
	}
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const formData = await request.formData();
		const email = formData.get('email')?.toString().trim() ?? '';
		const password = formData.get('password')?.toString() ?? '';

		// `auth.api.signInEmail` is a server-side call, so better-auth's own HTTP
		// rate limiter never sees it — throttle credential checks here.
		const ip = clientIp(request.headers, TRUSTED_PROXY, getClientAddress);
		if (!rateLimit(`login:${ip}`, LOGIN_LIMIT)) {
			return fail(429, { email, error: 'Too many sign-in attempts. Please wait and try again.' });
		}

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

		throw redirect(303, resolve('dashboard'));
	}
};
