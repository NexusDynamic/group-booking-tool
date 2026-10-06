import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from './db';
import { bookings, experiments, participants, sessions } from './db/schema';
import { priorAttendanceExists } from './exclusions';
import { isOpenStatus, syncSessionStatus } from './session-status';
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
 * `attended` / `no_show` booking for this experiment already.
 */
export class PriorAttendanceError extends Error {
	constructor() {
		super('You have already taken part in this experiment and cannot sign up again.');
	}
}

/** The participant already holds a confirmed seat on this session. */
export class AlreadyBookedError extends Error {
	constructor() {
		super('You are already booked on this session.');
	}
}

/**
 * The booking or its session is not in a state that allows the requested
 * change (session cancelled / already started / belongs to another
 * experiment, booking already attended, unknown token, ...).
 */
export class BookingStateError extends Error {}

/**
 * Upsert a participant row keyed by normalised email. Returns the row.
 * Thin wrapper — SQLite `ON CONFLICT` lets us do this in a single statement.
 *
 * An existing participant's `displayName` is left alone: this is reachable
 * from unauthenticated forms, so anyone who knows an email address could
 * otherwise rename that participant. Each booking snapshots the name typed
 * at the time.
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
			// No-op update so `.returning()` yields the existing row.
			set: { emailNormalised }
		})
		.returning();
	return row;
}

export interface CreateBookingInput {
	/** Experiment the caller is acting on; the session must belong to it. */
	experimentId: string;
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

function confirmedCount(tx: Parameters<typeof syncSessionStatus>[0], sessionId: string): number {
	const rows = tx
		.select({ n: sql<number>`count(*)` })
		.from(bookings)
		.where(and(eq(bookings.sessionId, sessionId), eq(bookings.status, 'confirmed')))
		.all();
	return Number(rows[0]?.n ?? 0);
}

/**
 * Atomically reserve a seat on a session and create a booking row.
 *
 * Everything runs inside a synchronous `db.transaction(...)` (better-sqlite3
 * serializes writes, so the checks and the insert cannot interleave with
 * another booking). Inside the transaction we:
 *   1. Re-read the session: it must belong to `experimentId`, be open, and
 *      not have started yet. `sessionId` comes straight from a public form,
 *      so this is what stops bookings on another (or unpublished) experiment.
 *   2. Enforce `exclude_prior_attendees` and one-seat-per-participant.
 *   3. Count confirmed bookings and throw `SessionFullError` at capacity.
 *   4. Insert the booking and re-derive the session's status.
 *
 * The raw token is returned only from this function — after this call it
 * lives solely in the URL the caller embeds in the response.
 */
export async function createBooking(input: CreateBookingInput): Promise<CreateBookingResult> {
	const rawToken = generateToken();
	const manageTokenHash = hashToken(rawToken);

	const booking = db.transaction((tx) => {
		const session = tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).all()[0];
		if (!session || session.experimentId !== input.experimentId) {
			throw new BookingStateError('This session is not available.');
		}
		if (!isOpenStatus(session.status)) {
			throw new BookingStateError(`This session is ${session.status}.`);
		}
		if (session.startsAt.getTime() <= Date.now()) {
			throw new BookingStateError('This session has already started.');
		}

		const experiment = tx
			.select({ excludePriorAttendees: experiments.excludePriorAttendees })
			.from(experiments)
			.where(eq(experiments.id, input.experimentId))
			.all()[0];
		if (
			experiment?.excludePriorAttendees &&
			priorAttendanceExists(tx, input.participantId, input.experimentId)
		) {
			throw new PriorAttendanceError();
		}

		const existing = tx
			.select({ id: bookings.id })
			.from(bookings)
			.where(
				and(
					eq(bookings.sessionId, input.sessionId),
					eq(bookings.participantId, input.participantId),
					eq(bookings.status, 'confirmed')
				)
			)
			.limit(1)
			.all();
		if (existing.length > 0) throw new AlreadyBookedError();

		if (confirmedCount(tx, input.sessionId) >= session.capacity) throw new SessionFullError();

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
		syncSessionStatus(tx, session.id);
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
 *
 * Pass `experimentId` (from the URL's slug) to require that the token belongs
 * to that experiment. The session's `scheduled` / `confirmed` status is
 * re-derived, so a session that drops below its minimum reverts.
 */
export async function cancelBookingByToken(
	rawToken: string,
	experimentId?: string
): Promise<Booking> {
	const manageTokenHash = hashToken(rawToken);
	return db.transaction((tx) => {
		const booking = tx
			.select()
			.from(bookings)
			.where(eq(bookings.manageTokenHash, manageTokenHash))
			.all()[0];
		if (!booking) throw new BookingStateError('Booking not found');
		if (experimentId !== undefined) {
			const session = tx
				.select({ experimentId: sessions.experimentId })
				.from(sessions)
				.where(eq(sessions.id, booking.sessionId))
				.all()[0];
			if (session?.experimentId !== experimentId) throw new BookingStateError('Booking not found');
		}
		if (booking.status === 'cancelled') return booking;
		if (booking.status === 'attended' || booking.status === 'no_show') {
			throw new BookingStateError(`Cannot cancel — booking is ${booking.status}`);
		}

		const [updated] = tx
			.update(bookings)
			.set({ status: 'cancelled', updatedAt: new Date() })
			.where(eq(bookings.id, booking.id))
			.returning()
			.all();
		syncSessionStatus(tx, booking.sessionId);
		return updated;
	});
}

/** Lookup bookings for a given session in newest-first order. */
export async function listBookingsForSession(sessionId: string): Promise<Booking[]> {
	return db
		.select()
		.from(bookings)
		.where(eq(bookings.sessionId, sessionId))
		.orderBy(desc(bookings.createdAt));
}

/**
 * Admin-level status update: mark attended / no-show / confirmed. Scoped to
 * `sessionId` so a booking id from another session is ignored. Returns
 * whether a booking was updated.
 */
export async function setBookingStatus(
	id: string,
	sessionId: string,
	status: 'confirmed' | 'cancelled' | 'attended' | 'no_show'
): Promise<boolean> {
	return db.transaction((tx) => {
		const updated = tx
			.update(bookings)
			.set({ status, updatedAt: new Date() })
			.where(and(eq(bookings.id, id), eq(bookings.sessionId, sessionId)))
			.returning({ id: bookings.id })
			.all();
		if (updated.length === 0) return false;
		syncSessionStatus(tx, sessionId);
		return true;
	});
}
