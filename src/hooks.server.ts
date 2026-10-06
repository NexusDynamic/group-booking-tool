import { building } from '$app/env';
import { error, redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';
import { resolve as resolvePath } from '$app/paths';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth, isSignupLocked } from '#lib/server/auth.js';
import { clientIp, isAdminRoute, isPublicBookingRoute } from '#lib/server/guards.js';
import { LOGIN_LIMIT, rateLimit } from '#lib/server/rate-limit.js';
import { TRUSTED_PROXY } from '$app/env/private';

/**
 * Early 403 for better-auth's signup endpoints once an admin exists. The
 * authoritative lock is the `databaseHooks.user.create.before` hook in
 * `auth.ts`; this just avoids doing any work for the obvious case.
 */
const handleSignupLock: Handle = async ({ event, resolve }) => {
	if (event.url.pathname.includes('/api/auth/sign-up')) {
		if (await isSignupLocked()) {
			return new Response(JSON.stringify({ error: 'Signup is disabled on this instance.' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
	}
	return resolve(event);
};

const tooManyRequests = () =>
	new Response('Too many requests — please slow down.', { status: 429 });

/**
 * Rate-limit POSTs to public booking routes and to better-auth's sign-in
 * endpoint. Keyed by the client IP (see `clientIp` for which headers are
 * trusted). In-memory only; a process restart flushes the buckets.
 *
 * The `/login` form action applies the same login bucket itself so it can
 * re-render the form with a message instead of a bare 429.
 */
const handleRateLimit: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'POST') {
		const ip = () => clientIp(event.request.headers, TRUSTED_PROXY, () => event.getClientAddress());
		if (isPublicBookingRoute(event.route.id)) {
			if (!rateLimit(`e:${ip()}`)) return tooManyRequests();
		} else if (event.url.pathname.includes('/api/auth/sign-in')) {
			if (!rateLimit(`login:${ip()}`, LOGIN_LIMIT)) return tooManyRequests();
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
 * Require a signed-in researcher for everything under `(admin)`.
 *
 * This must live in `handle`: the `(admin)/+layout.server.ts` load does not
 * run before form actions, so on its own it leaves every admin action open
 * to unauthenticated POSTs.
 */
const handleAdminGuard: Handle = async ({ event, resolve }) => {
	if (isAdminRoute(event.route.id) && !event.locals.user) {
		if (event.request.method === 'GET' || event.request.method === 'HEAD') {
			const next = encodeURIComponent(event.url.pathname + event.url.search);
			throw redirect(303, resolvePath(`login?next=${next}`));
		}
		throw error(401, 'You must be signed in to do that.');
	}
	return resolve(event);
};

/**
 * Security headers applied to every response.
 * CSP is configured in vite.config.ts so that SvelteKit can inject the
 * per-request nonce into script-src automatically (needed for the inline
 * FOUC-prevention script in app.html that uses %sveltekit.nonce%).
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');

	// Prevent Cloudflare Rocket Loader (and other transforming proxies) from
	// rewriting <script> tags on HTML pages. Rocket Loader strips nonce
	// attributes, which breaks SvelteKit's nonce-based CSP and stops the page
	// from hydrating. Cache-Control: no-transform is the documented opt-out.
	// Scoped to HTML only so static asset caching is unaffected.
	if (response.headers.get('content-type')?.includes('text/html')) {
		const existing = response.headers.get('cache-control');
		response.headers.set('cache-control', existing ? `${existing}, no-transform` : 'no-transform');
	}

	return response;
};

export const handle: Handle = sequence(
	handleSignupLock,
	handleRateLimit,
	handleBetterAuth,
	handleAdminGuard,
	handleSecurityHeaders
);
