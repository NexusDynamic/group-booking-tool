import type { Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { sequence } from '@sveltejs/kit/hooks';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user } from '$lib/server/db/schema';
import { rateLimit } from '$lib/server/rate-limit';
import { env } from '$env/dynamic/private';

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
			return new Response(JSON.stringify({ error: 'Signup is disabled on this instance.' }), {
				status: 403,
				headers: { 'content-type': 'application/json' }
			});
		}
	}
	return resolve(event);
};

/**
 * Resolve the real client IP from request headers.
 *
 * - Behind Cloudflare: set TRUSTED_PROXY=cloudflare and use CF-Connecting-IP,
 *   which Cloudflare controls and clients cannot spoof.  X-Forwarded-For must
 *   NOT be used in that case because Cloudflare appends the real IP but the
 *   client can inject arbitrary leading values.
 * - Behind any other trusted reverse proxy (nginx, etc.): use the first value
 *   of X-Forwarded-For, which the proxy prepends.
 * - Direct access: fall back to the socket address via getClientAddress().
 */
function getClientIp(event: Parameters<Handle>[0]['event']): string {
	if (env.TRUSTED_PROXY === 'cloudflare') {
		const ip = event.request.headers.get('cf-connecting-ip');
		if (ip) return ip;
	}
	return (
		event.request.headers.get('x-forwarded-for')?.split(',')[0].trim() || event.getClientAddress()
	);
}

/**
 * Rate-limit POSTs to public booking routes. Keyed by the client IP.
 * In-memory only; a process restart flushes the buckets.
 */
const handlePublicRateLimit: Handle = async ({ event, resolve }) => {
	if (event.request.method === 'POST' && event.url.pathname.startsWith('/e/')) {
		if (!rateLimit(`e:${getClientIp(event)}`)) {
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
 * Security headers applied to every response.
 * CSP is configured in svelte.config.js so that SvelteKit can inject the
 * per-request nonce into script-src automatically (needed for the inline
 * FOUC-prevention script in app.html that uses %sveltekit.nonce%).
 */
const handleSecurityHeaders: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'same-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	return response;
};

export const handle: Handle = sequence(
	handleSignupLock,
	handlePublicRateLimit,
	handleBetterAuth,
	handleSecurityHeaders
);
