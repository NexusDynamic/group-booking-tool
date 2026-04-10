import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { bookings, participants, sessions } from './db/schema';
import { generateToken, hashToken } from './tokens';
import { normaliseEmail } from './validate';

export type Booking = typeof bookings.$inferSelect;
export type Participant = typeof participants.$inferSelect;

/**
 * Capacity overflow — thrown when a session has no remaining seats at the
 * moment the transaction committed.
 */
export class SessionFullError extends Error {
	constructor() {
		super('This session is already full.');
	}
}

/**
 * Researcher has set `exclude_prior_attendees` and this participant has an
 * `attended` booking for this experiment already.
 */
export class PriorAttendanceError extends Error {
	constructor() {
		super('You have already attended this experiment.');
	}
}

/**
 * Booking status changes that participants are not allowed to perform (e.g.
 * cancelling an already-cancelled booking).
 */
export class BookingStateError extends Error {}

/**
 * Upsert a participant row keyed by normalised email. Returns the row.
 * Thin wrapper — SQLite `ON CONFLICT` lets us do this in a single statement.
 */
export async function upsertParticipant(input: {
	email: string;
	displayName: string;
}): Promise<Participant> {
	const emailNormalised = normaliseEmail(input.email);
	const [row] = await db
		.insert(participants)
		.values({ emailNormalised, displayName: input.displayName })
		.onConflictDoUpdate({
			target: participants.emailNormalised,
			set: { displayName: input.displayName }
		})
		.returning();
	return row;
}

export interface CreateBookingInput {
	sessionId: string;
	participantId: string;
	snapshotName: string;
	snapshotEmail: string;
	snapshotFields: Record<string, unknown>;
}

export interface CreateBookingResult {
	booking: Booking;
	rawToken: string;
}

/**
 * Atomically reserve a seat on a session and create a booking row.
 *
 * Capacity enforcement: we run the whole thing inside a synchronous
 * `db.transaction(...)` (better-sqlite3 serializes writes anyway, but the
 * transaction gives us a clean rollback path if anything inside throws).
 * Inside the transaction we:
 *   1. Re-read the session row to check it exists and is scheduled.
 *   2. Count confirmed bookings for this session.
 *   3. Throw `SessionFullError` if the count has reached capacity.
 *   4. Otherwise insert the booking.
 *
 * The raw token is returned only from this function — after this call it
 * lives solely in the URL the caller embeds in the response.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
	const rawToken = generateToken();
	const manageTokenHash = hashToken(rawToken);

	// better-sqlite3 transactions are synchronous; drizzle's `.transaction()`
	// accepts a sync callback for this driver. We wrap in a Promise-returning
	// async function for API consistency.
	const booking = db.transaction((tx) => {
		const sessionRows = tx
			.select()
			.from(sessions)
			.where(eq(sessions.id, input.sessionId))
			.all();
		const session = sessionRows[0];
		if (!session) throw new Error(`Session ${input.sessionId} not found`);
		if (session.status !== 'scheduled') {
			throw new BookingStateError(`Session is ${session.status}`);
		}

		const countRows = tx
			.select({ n: sql<number>`count(*)` })
			.from(bookings)
			.where(and(eq(bookings.sessionId, input.sessionId), eq(bookings.status, 'confirmed')))
			.all();
		const confirmed = Number(countRows[0]?.n ?? 0);
		if (confirmed >= session.capacity) throw new SessionFullError();

		const [row] = tx
			.insert(bookings)
			.values({
				sessionId: input.sessionId,
				participantId: input.participantId,
				snapshotName: input.snapshotName,
				snapshotEmail: input.snapshotEmail,
				snapshotFields: JSON.stringify(input.snapshotFields),
				manageTokenHash
			})
			.returning()
			.all();
		return row;
	});

	return { booking, rawToken };
}

/**
 * Look up a booking by its raw self-manage token. Hashes the raw token and
 * does a single indexed SELECT — the raw token never touches the DB.
 *
 * Returns `undefined` if no booking matches (the caller should render a
 * 404-style "this link is no longer valid" page).
 */
export async function findBookingByToken(rawToken: string): Promise<Booking | undefined> {
	const h = hashToken(rawToken);
	const rows = await db.select().from(bookings).where(eq(bookings.manageTokenHash, h)).limit(1);
	return rows[0];
}

/**
 * Cancel a booking from the public self-manage page. Idempotent: cancelling
 * an already-cancelled booking is a no-op.
 */
export async function cancelBookingByToken(rawToken: string): Promise<Booking> {
	const booking = await findBookingByToken(rawToken);
	if (!booking) throw new BookingStateError('Booking not found');
	if (booking.status === 'cancelled') return booking;
	if (booking.status === 'attended' || booking.status === 'no_show') {
		throw new BookingStateError(`Cannot cancel — booking is ${booking.status}`);
	}
	const [updated] = await db
		.update(bookings)
		.set({ status: 'cancelled', updatedAt: new Date() })
		.where(eq(bookings.id, booking.id))
		.returning();
	return updated;
}

/** Lookup bookings for a given session in newest-first order. */
export async function listBookingsForSession(sessionId: string): Promise<Booking[]> {
	return db
		.select()
		.from(bookings)
		.where(eq(bookings.sessionId, sessionId))
		.orderBy(desc(bookings.createdAt));
}

/** Admin-level status update: mark attended / no-show / confirmed. */
export async function setBookingStatus(
	id: string,
	status: 'confirmed' | 'cancelled' | 'attended' | 'no_show'
): Promise<void> {
	await db
		.update(bookings)
		.set({ status, updatedAt: new Date() })
		.where(eq(bookings.id, id));
}
