import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';

/**
 * Lock signups once any user exists. The tool is single-researcher; the admin
 * is created via `pnpm seed:admin` (which uses its own better-auth instance),
 * and user creation through this instance is refused for everyone afterwards.
 *
 * We cache the "a user exists" flag in memory after the first positive check
 * because the answer is monotonic: once true, it stays true.
 */
let lockedCache = false;

export async function isSignupLocked(): Promise<boolean> {
	if (lockedCache) return true;
	const rows = await db.select({ id: user.id }).from(user).limit(1);
	if (rows.length > 0) {
		lockedCache = true;
		return true;
	}
	return false;
}

/**
 * `vite build` imports this module while analysing routes, and better-auth
 * refuses to initialise in production without a secret. No request is ever
 * served by that build-time instance, so give it a throwaway value — this
 * keeps the real secret (and `.env`) out of the Docker build entirely. The
 * running server always reads BETTER_AUTH_SECRET from its environment.
 */
const BUILD_ONLY_SECRET = 'build-time-placeholder-never-used-to-sign-anything';

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: building ? BUILD_ONLY_SECRET : BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	databaseHooks: {
		user: {
			create: {
				// Enforced at the database layer so the lock holds no matter which
				// endpoint or URL shape reaches better-auth.
				before: async () => {
					if (await isSignupLocked()) {
						throw new APIError('FORBIDDEN', { message: 'Signup is disabled on this instance.' });
					}
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
