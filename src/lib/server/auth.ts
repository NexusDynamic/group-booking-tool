import { betterAuth } from 'better-auth/minimal';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
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

export const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
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
