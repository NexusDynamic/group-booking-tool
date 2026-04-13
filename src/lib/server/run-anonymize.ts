/**
 * CLI script — runs the GDPR anonymisation sweep once and exits.
 *
 * Usage (reads .env automatically):
 *   pnpm anonymize
 *
 * Environment variables:
 *   DATABASE_URL          — path to the SQLite file (required)
 *   DATA_RETENTION_DAYS   — global fallback retention window in days (default 90)
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './db/schema.ts';
import { runAnonymizationJob } from './anonymization.ts';

const { DATABASE_URL, DATA_RETENTION_DAYS } = process.env;

if (!DATABASE_URL) {
	console.error('[anonymize] DATABASE_URL is not set. Edit .env and try again.');
	process.exit(1);
}

const defaultRetentionDays = DATA_RETENTION_DAYS ? parseInt(DATA_RETENTION_DAYS, 10) : 90;
if (!Number.isFinite(defaultRetentionDays) || defaultRetentionDays < 1) {
	console.error(
		`[anonymize] DATA_RETENTION_DAYS must be a positive integer, got: ${DATA_RETENTION_DAYS}`
	);
	process.exit(1);
}

const client = new Database(DATABASE_URL);
const db = drizzle(client, { schema });

console.log(
	`[anonymize] Running anonymisation sweep (default retention: ${defaultRetentionDays} days)…`
);

try {
	const result = await runAnonymizationJob(db, { defaultRetentionDays });
	console.log(`[anonymize] Done.`);
	console.log(`  Bookings anonymised:      ${result.bookingsAnonymised}`);
	console.log(`  Preferences anonymised:   ${result.preferencesAnonymised}`);
	console.log(`  Participants anonymised:  ${result.participantsAnonymised}`);
	console.log(`  Auth sessions deleted:    ${result.authSessionsDeleted}`);
} catch (err) {
	console.error('[anonymize] Failed:', err);
	process.exit(1);
} finally {
	client.close();
}
