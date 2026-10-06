import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from './db';
import { bookings, sessions } from './db/schema';

/**
 * Session status model:
 *   - `scheduled`  open, minimum participants not yet reached
 *   - `confirmed`  open, minimum reached (it will run) — still bookable until full
 *   - `cancelled` / `completed`  closed; set explicitly by the researcher
 *
 * `scheduled` ↔ `confirmed` is derived from the booking count and kept in
 * step by `syncSessionStatus`; nothing else should write those two values.
 */
export const OPEN_SESSION_STATUSES = ['scheduled', 'confirmed'] as const;

/** Is the session still running as planned (i.e. not cancelled/completed)? */
export function isOpenStatus(status: string): boolean {
	return (OPEN_SESSION_STATUSES as readonly string[]).includes(status);
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** Either the root connection or an open transaction. */
export type Executor = typeof db | Tx;

/**
 * Recompute `scheduled` / `confirmed` for one session from its bookings.
 * Call after anything that changes the booking count or `minParticipants`.
 * Closed sessions are left untouched.
 *
 * Every non-cancelled booking counts, so marking attendance after the
 * session has run does not flip it back to `scheduled`.
 */
export function syncSessionStatus(tx: Executor, sessionId: string): void {
	const session = tx.select().from(sessions).where(eq(sessions.id, sessionId)).all()[0];
	if (!session || !isOpenStatus(session.status)) return;

	const rows = tx
		.select({ n: sql<number>`count(*)` })
		.from(bookings)
		.where(and(eq(bookings.sessionId, sessionId), ne(bookings.status, 'cancelled')))
		.all();
	const held = Number(rows[0]?.n ?? 0);

	const status = held >= session.minParticipants ? 'confirmed' : 'scheduled';
	if (status !== session.status) {
		tx.update(sessions)
			.set({ status, updatedAt: new Date() })
			.where(eq(sessions.id, sessionId))
			.run();
	}
}
