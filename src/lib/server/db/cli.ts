/**
 * Database handle for the standalone CLI scripts (seed-admin, run-anonymize,
 * fix-session-statuses). They run under plain Node via tsx, outside the
 * SvelteKit runtime, so they cannot import `./index` (which reads
 * `$app/env/private`).
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.ts';

export function openCliDb(tag: string) {
	const url = process.env.DATABASE_URL;
	if (!url) {
		console.error(`[${tag}] DATABASE_URL is not set. Edit .env and try again.`);
		process.exit(1);
	}
	const client = new Database(url);
	return { client, db: drizzle(client, { schema }) };
}
