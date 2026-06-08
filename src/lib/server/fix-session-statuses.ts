/**
 * One-time data-fix script (idempotent — safe to run on every startup).
 *
 * Reverts any session that is incorrectly marked 'confirmed' back to
 * 'scheduled'. A session ends up in this state when participants cancel after
 * the confirmed-count hit minParticipants, because the old cancelBookingByToken
 * did not revert the session status.
 *
 * Run via docker-entrypoint.sh:
 *   node_modules/.bin/tsx src/lib/server/fix-session-statuses.ts
 */
import Database from 'better-sqlite3';

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) throw new Error('DATABASE_URL is not set');

const client = new Database(dbUrl);

const result = client
	.prepare(
		`UPDATE sessions
     SET status = 'scheduled', updated_at = datetime('now')
     WHERE status = 'confirmed'
       AND (
         SELECT count(*) FROM bookings
         WHERE bookings.session_id = sessions.id
           AND bookings.status = 'confirmed'
       ) < min_participants`
	)
	.run();

if (result.changes > 0) {
	console.log(
		`[fix-session-statuses] Reverted ${result.changes} session(s) from 'confirmed' to 'scheduled' (confirmed booking count was below minParticipants).`
	);
} else {
	console.log('[fix-session-statuses] No sessions needed fixing.');
}

client.close();
