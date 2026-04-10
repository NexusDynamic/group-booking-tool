import { and, eq, inArray, or } from 'drizzle-orm';
import { db } from './db';
import { bookings, sessions } from './db/schema';

/**
 * Does this participant have any `attended` (or `no_show`) booking on this
 * experiment? Used by the booking action when the experiment has
 * `exclude_prior_attendees` turned on.
 *
 * We consider both `attended` and `no_show` as "prior attendance" — if the
 * participant already made it through the door (or flaked on it) they're
 * disqualified from signing up again.
 */
export async function hasPriorAttendance(
	participantId: string,
	experimentId: string
): Promise<boolean> {
	// Look up all sessions for this experiment and check for bookings against
	// them where the participant's status indicates prior engagement.
	const expSessions = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(eq(sessions.experimentId, experimentId));
	if (expSessions.length === 0) return false;
	const sessionIds = expSessions.map((s) => s.id);

	const hits = await db
		.select({ id: bookings.id })
		.from(bookings)
		.where(
			and(
				eq(bookings.participantId, participantId),
				inArray(bookings.sessionId, sessionIds),
				or(eq(bookings.status, 'attended'), eq(bookings.status, 'no_show'))
			)
		)
		.limit(1);
	return hits.length > 0;
}
