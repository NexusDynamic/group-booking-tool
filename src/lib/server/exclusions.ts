import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { bookings, sessions } from './db/schema';
import type { Executor } from './session-status';

/**
 * Does this participant have any `attended` (or `no_show`) booking on this
 * experiment? Enforced by `createBooking` when the experiment has
 * `exclude_prior_attendees` turned on.
 *
 * We consider both `attended` and `no_show` as "prior attendance" — if the
 * participant already made it through the door (or flaked on it) they're
 * disqualified from signing up again.
 *
 * Synchronous so it can run inside a better-sqlite3 transaction.
 */
export function priorAttendanceExists(
	tx: Executor,
	participantId: string,
	experimentId: string
): boolean {
	const hits = tx
		.select({ id: bookings.id })
		.from(bookings)
		.innerJoin(sessions, eq(bookings.sessionId, sessions.id))
		.where(
			and(
				eq(bookings.participantId, participantId),
				eq(sessions.experimentId, experimentId),
				inArray(bookings.status, ['attended', 'no_show'])
			)
		)
		.limit(1)
		.all();
	return hits.length > 0;
}

export async function hasPriorAttendance(
	participantId: string,
	experimentId: string
): Promise<boolean> {
	return priorAttendanceExists(db, participantId, experimentId);
}
