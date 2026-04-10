/**
 * Idempotent admin seed script.
 *
 * Run with:
 *   pnpm seed:admin
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from .env. If any user already exists
 * in the database the script is a no-op (the signup-lock hook also prevents
 * subsequent signups at runtime).
 *
 * This script instantiates its own minimal better-auth instance — it cannot
 * reuse `$lib/server/auth` because that module imports `$app/server` which
 * only resolves inside a SvelteKit runtime.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import * as schema from './db/schema.ts';

const { DATABASE_URL, ORIGIN, BETTER_AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

function requireEnv(name: string, value: string | undefined): string {
	if (!value) {
		console.error(`[seed-admin] ${name} is not set. Edit .env and try again.`);
		process.exit(1);
	}
	return value;
}

const dbUrl = requireEnv('DATABASE_URL', DATABASE_URL);
requireEnv('BETTER_AUTH_SECRET', BETTER_AUTH_SECRET);
const email = requireEnv('ADMIN_EMAIL', ADMIN_EMAIL);
const password = requireEnv('ADMIN_PASSWORD', ADMIN_PASSWORD);

const client = new Database(dbUrl);
const db = drizzle(client, { schema });

const auth = betterAuth({
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true }
});

const existing = await db.select().from(schema.user).limit(1);
if (existing.length > 0) {
	console.log(`[seed-admin] Admin already exists (${existing[0].email}). No changes.`);
	process.exit(0);
}

try {
	await auth.api.signUpEmail({
		body: { email, password, name: 'Admin' }
	});
	console.log(`[seed-admin] ✓ Created admin account: ${email}`);
	console.log(`[seed-admin]   Log in at ${ORIGIN || 'http://localhost:5173'}/login`);
} catch (err) {
	console.error('[seed-admin] Failed to create admin:', err);
	process.exit(1);
}
