import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/rate-limit';

/**
 * Lock signups once any user exists. The tool is single-researcher; the admin
 * is created via `pnpm seed:admin`, and better-auth's signup endpoints are
 * 403'd for everyone afterwards.
 *
 * We cache the "a user exists" flag in memory after the first positive check
 * because the answer is monotonic: once true, it stays true.
 */
let lockedCache = false;

async function isSignupLocked(): Promise<boolean> {
	if (lockedCache) return true;
	const rows = await db.select({ id: user.id }).from(user).limit(1);
	if (rows.length > 0) {
		lockedCache = true;
		return true;
	}
	return false;
}

const handleSignupLock: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.startsWith('/api/auth/sign-up')) {
		if (await isSignupLocked()) {
			return new Response(
				JSON.stringify({ error: 'Signup is disabled on this instance.' }),
				{ status: 403, headers: { 'content-type': 'application/json' } }
			);
		}
	}
	return resolve(event);
};

/**
 * Rate-limit POSTs to public booking routes. Keyed by the client IP
 * (x-forwarded-for first hop, or direct remote address). In-memory only; a
 * process restart flushes the buckets.
 */
const handlePublicRateLimit: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'POST' && event.url.pathname.startsWith('/e/')) {
		const ip =
			event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
			event.getClientAddress();
		if (!rateLimit(`e:${ip}`)) {
			return new Response('Too many requests — please slow down.', { status: 429 });
		}
	}
	return resolve(event);
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });
	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}
	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * Security headers applied to every response. The public `/e/**` routes get
 * a stricter CSP that forbids inline scripts — the public booking pages are
 * all server-rendered forms, so this does not break them. Admin routes fall
 * back to a looser CSP because SvelteKit's dev HMR / inspector need inline
 * script tags; the admin surface is behind auth anyway.
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');

	const isPublic = event.url.pathname.startsWith('/e/');
	if (isPublic) {
		response.headers.set(
			'Content-Security-Policy',
			[
				"default-src 'self'",
				"script-src 'self'",
				"style-src 'self' 'unsafe-inline'",
				"img-src 'self' data:",
				"font-src 'self' data:",
				"connect-src 'self'",
				"form-action 'self'",
				"frame-ancestors 'none'",
				"base-uri 'self'"
			].join('; ')
		);
	}
	return response;
};

export const handle: Handle = sequence(
	handleSignupLock,
	handlePublicRateLimit,
	handleBetterAuth,
	handleSecurityHeaders
);
