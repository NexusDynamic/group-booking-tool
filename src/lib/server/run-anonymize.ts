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
import { openCliDb } from './db/cli.ts';
import { runAnonymizationJob } from './anonymization.ts';

const { DATA_RETENTION_DAYS } = process.env;

const defaultRetentionDays = DATA_RETENTION_DAYS ? parseInt(DATA_RETENTION_DAYS, 10) : 90;
if (!Number.isFinite(defaultRetentionDays) || defaultRetentionDays < 1) {
	console.error(
		`[anonymize] DATA_RETENTION_DAYS must be a positive integer, got: ${DATA_RETENTION_DAYS}`
	);
	process.exit(1);
}

const { client, db } = openCliDb('anonymize');

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
