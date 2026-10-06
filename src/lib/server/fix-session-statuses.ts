/**
 * Data-fix script (idempotent — safe to run on every startup).
 *
 * Re-derives 'scheduled' / 'confirmed' for every open session from its
 * bookings, mirroring `syncSessionStatus` in session-status.ts: 'confirmed'
 * once the non-cancelled booking count reaches min_participants, otherwise
 * 'scheduled'. Older versions let the two drift apart.
 *
 * Also repairs `updated_at` values that an earlier version of this script
 * wrote as text (`datetime('now')`) into the integer epoch-ms column.
 *
 * Run via docker-entrypoint.sh:
 *   node_modules/.bin/tsx src/lib/server/fix-session-statuses.ts
 */
import { openCliDb } from './db/cli.ts';

const { client } = openCliDb('fix-session-statuses');

const NOW_MS = `cast(unixepoch('subsecond') * 1000 as integer)`;

const repaired = client
	.prepare(
		`UPDATE sessions
     SET updated_at = cast(unixepoch(updated_at) * 1000 as integer)
     WHERE typeof(updated_at) = 'text'`
	)
	.run();
if (repaired.changes > 0) {
	console.log(`[fix-session-statuses] Repaired ${repaired.changes} text updated_at value(s).`);
}

const HELD = `(
  SELECT count(*) FROM bookings
  WHERE bookings.session_id = sessions.id
    AND bookings.status != 'cancelled'
)`;

const result = client
	.prepare(
		`UPDATE sessions
     SET status = CASE WHEN ${HELD} >= min_participants THEN 'confirmed' ELSE 'scheduled' END,
         updated_at = ${NOW_MS}
     WHERE status IN ('scheduled', 'confirmed')
       AND status != CASE WHEN ${HELD} >= min_participants THEN 'confirmed' ELSE 'scheduled' END`
	)
	.run();

if (result.changes > 0) {
	console.log(
		`[fix-session-statuses] Re-derived status for ${result.changes} session(s) from their booking counts.`
	);
} else {
	console.log('[fix-session-statuses] No sessions needed fixing.');
}

client.close();
