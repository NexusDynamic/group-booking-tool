import { createEvents, type EventAttributes, type DateArray } from 'ics';
import { and, asc, eq, gte, inArray } from 'drizzle-orm';
import { db } from './db';
import { bookings, experiments, reminderRules, sessions } from './db/schema';

/**
 * ICS feed generation.
 *
 * Two feeds per experiment:
 *   - Public:     a VEVENT per scheduled session. SUMMARY includes the live
 *                 `(n/cap)` count so subscribers see fill state in their
 *                 calendar without needing a separate tool.
 *   - Researcher: public events + extra reminder VEVENTs per reminder rule.
 *                 Each rule has a condition (always / below_minimum /
 *                 at_capacity) that gates whether the reminder fires for a
 *                 given session.
 *
 * Each event uses a stable UID of the form `<sessionId>@<host>` so calendars
 * dedupe between refreshes. Reminder events use a rule-scoped UID suffix so
 * multiple reminders on the same session don't collide.
 */

export interface IcsOpts {
	/** Hostname used in the UID suffix. Defaults to "localhost". */
	host?: string;
	/** Look-ahead window in days. Sessions further out are excluded to keep
	 *  the feed bounded. Defaults to 365. */
	lookaheadDays?: number;
}

interface SessionRow {
	id: string;
	startsAt: Date;
	endsAt: Date;
	capacity: number;
	minParticipants: number;
	location: string;
	notes: string;
	status: string;
	confirmedCount: number;
	participants?: ParticipantInSession[];
}

interface ParticipantInSession {
	participantEmail: string;
	participantName: string | undefined;
	participantFormValues: Record<string, string>;
}

function buildCalendarEvent(
	eventAttrs: EventAttributes,
	id: string,
	host: string,
	adminEmail: string,
	adminDisplayName: string | undefined
): EventAttributes {
	return {
		startInputType: 'utc',
		endInputType: 'utc',
		...eventAttrs,
		organizer: {
			name: adminDisplayName ?? 'Experiment Organizer',
			email: adminEmail
		},
		attendees: [
			{
				name: adminDisplayName ?? 'Experiment Organizer',
				email: adminEmail,
				rsvp: true,
				role: 'CHAIR',
				partstat: 'ACCEPTED'
			},
			...(eventAttrs.attendees ?? [])
		]
	};
}

function sessionStatusToIcsStatus(status: string): 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE' {
	switch (status) {
		case 'scheduled':
			return 'TENTATIVE';
		case 'cancelled':
			return 'CANCELLED';
		default:
			return 'CONFIRMED';
	}
}

function sessionStatusForEventName(status: string): string {
	switch (status) {
		case 'scheduled':
			return '[PENDING-CONFIRMATION] ';
		case 'cancelled':
			return '[CANCELLED] ';
		case 'completed':
			return '[COMPLETED] ';
		default:
			return '[CONFIRMED] ';
	}
}

async function loadFeedData(
	experimentId: string,
	opts: IcsOpts,
	includeParticipants = false
): Promise<{ experiment: typeof experiments.$inferSelect; sessions: SessionRow[] }> {
	const lookaheadDays = opts.lookaheadDays ?? 365;
	const cutoff = new Date(Date.now() + lookaheadDays * 24 * 60 * 60 * 1000);
	const now = new Date();

	const [exp] = await db
		.select()
		.from(experiments)
		.where(eq(experiments.id, experimentId))
		.limit(1);
	if (!exp) throw new Error(`experiment ${experimentId} not found`);

	const sessionRows = await db
		.select()
		.from(sessions)
		.where(and(eq(sessions.experimentId, experimentId), gte(sessions.startsAt, now)))
		.orderBy(asc(sessions.startsAt));

	const filtered = sessionRows.filter(
		(r) => (r.status === 'scheduled' || r.status === 'confirmed') && r.startsAt <= cutoff
	);

	// Count confirmed bookings per session in one follow-up query, then map
	// into the feed shape. Cleaner than a correlated sub-query via drizzle's
	// sql template — and easier to test.
	const countsBySession = new Map<string, number>();
	const participantInfoBySession = new Map<string, ParticipantInSession[]>();
	if (filtered.length > 0) {
		if (includeParticipants) {
			const bookingRows = await db
				.select()
				.from(bookings)
				.where(
					inArray(
						bookings.sessionId,
						filtered.map((s) => s.id)
					)
				);
			for (const b of bookingRows) {
				if (b.status === 'confirmed') {
					countsBySession.set(b.sessionId, (countsBySession.get(b.sessionId) ?? 0) + 1);
					if (b.snapshotEmail) {
						const participantInfo = participantInfoBySession.get(b.sessionId) ?? [];
						participantInfo.push({
							participantEmail: b.snapshotEmail,
							participantName: b.snapshotName,
							participantFormValues: JSON.parse(b.snapshotFields)
						});
						participantInfoBySession.set(b.sessionId, participantInfo);
					}
				}
			}
		} else {
			const bookingRows = await db
				.select({ sessionId: bookings.sessionId, status: bookings.status })
				.from(bookings)
				.where(
					inArray(
						bookings.sessionId,
						filtered.map((s) => s.id)
					)
				);
			for (const b of bookingRows) {
				if (b.status === 'confirmed') {
					countsBySession.set(b.sessionId, (countsBySession.get(b.sessionId) ?? 0) + 1);
				}
			}
		}
	}

	const scheduled: SessionRow[] = filtered.map((r) => ({
		id: r.id,
		startsAt: r.startsAt,
		endsAt: r.endsAt,
		capacity: r.capacity,
		minParticipants: r.minParticipants,
		location: r.location,
		notes: r.notes,
		status: r.status,
		confirmedCount: countsBySession.get(r.id) ?? 0,
		participants: participantInfoBySession.get(r.id) ?? []
	}));

	return { experiment: exp, sessions: scheduled };
}

function toDateArray(d: Date): DateArray {
	// ics expects [y, m, d, h, mi] in UTC when we pass startInputType 'utc'.
	return [
		d.getUTCFullYear(),
		d.getUTCMonth() + 1,
		d.getUTCDate(),
		d.getUTCHours(),
		d.getUTCMinutes()
	];
}

function buildPublicEvent(
	exp: typeof experiments.$inferSelect,
	s: SessionRow,
	host: string
): EventAttributes {
	return buildCalendarEvent(
		{
			uid: `${s.id}@${host}`,
			title: `${sessionStatusForEventName(s.status)}${exp.name} (${s.confirmedCount}/${s.capacity})`,
			description: exp.description,
			location: s.location || undefined,
			start: toDateArray(s.startsAt),
			end: toDateArray(s.endsAt),
			status: sessionStatusToIcsStatus(s.status)
		},
		s.id,
		host,
		exp.experimenterEmail,
		exp.experimenterName
	);
}

function buildResearcherEvent(
	exp: typeof experiments.$inferSelect,
	s: SessionRow,
	host: string
): EventAttributes {
	let description = exp.description;
	if (s.participants && s.participants.length > 0) {
		description += '\n\nParticipant form values:\n';
		s.participants.forEach((p) => {
			description += `- ${p.participantName ?? p.participantEmail} (${p.participantEmail}):\n`;
			for (const [k, v] of Object.entries(p.participantFormValues)) {
				description += `---- ${k}: ${v}\n`;
			}
		});
	}
	return buildCalendarEvent(
		{
			uid: `${s.id}@${host}`,
			title: `${sessionStatusForEventName(s.status)}${exp.name} (${s.confirmedCount}/${s.capacity})`,
			description: description,
			location: s.location || undefined,
			start: toDateArray(s.startsAt),
			end: toDateArray(s.endsAt),
			status: sessionStatusToIcsStatus(s.status)
		},
		s.id,
		host,
		exp.experimenterEmail,
		exp.experimenterName
	);
}

function buildParticipantSessionEvent(
	exp: typeof experiments.$inferSelect,
	s: SessionRow,
	host: string
): EventAttributes {
	return buildCalendarEvent(
		{
			uid: `${s.id}@${host}`,
			title: `${sessionStatusForEventName(s.status)}${exp.name}`,
			description: exp.description,
			location: s.location || undefined,
			start: toDateArray(s.startsAt),
			end: toDateArray(s.endsAt),
			status: sessionStatusToIcsStatus(s.status)
		},
		s.id,
		host,
		exp.experimenterEmail,
		exp.experimenterName
	);
}

function reminderMatchesCondition(condition: string, s: SessionRow): boolean {
	switch (condition) {
		case 'always':
			return true;
		case 'below_minimum':
			return s.confirmedCount < s.minParticipants;
		case 'at_capacity':
			return s.confirmedCount >= s.capacity;
		default:
			return false;
	}
}

function buildReminderEvent(
	exp: typeof experiments.$inferSelect,
	s: SessionRow,
	rule: typeof reminderRules.$inferSelect,
	host: string
): EventAttributes {
	const reminderStart = new Date(s.startsAt.getTime() - rule.offsetMinutesBefore * 60 * 1000);
	const reminderEnd = new Date(reminderStart.getTime() + rule.durationMinutes * 60 * 1000);
	return buildCalendarEvent(
		{
			uid: `${s.id}-reminder-${rule.id}@${host}`,
			title: `${rule.label} — ${exp.name} (${s.confirmedCount}/${s.capacity})`,
			description: `Reminder for session ${s.id}. Current booking count: ${s.confirmedCount}/${s.capacity}. Minimum: ${s.minParticipants}.`,
			start: toDateArray(reminderStart),
			end: toDateArray(reminderEnd),
			startInputType: 'utc',
			endInputType: 'utc',
			status: 'CONFIRMED'
		},
		s.id,
		host,
		exp.experimenterEmail,
		exp.experimenterName
	);
}

function renderEvents(events: EventAttributes[]): string {
	if (events.length === 0) {
		// ics bails on an empty list; hand-roll a minimal empty calendar.
		return 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//group-booking-tool//EN\r\nEND:VCALENDAR\r\n';
	}
	const { value, error } = createEvents(events);
	if (error || !value) throw error ?? new Error('ics createEvents returned no value');
	return value;
}

/** Public feed: one event per scheduled future session. */
export async function buildExperimentFeed(
	experimentId: string,
	opts: IcsOpts = {}
): Promise<string> {
	const host = opts.host ?? 'localhost';
	const { experiment, sessions: rows } = await loadFeedData(experimentId, opts);
	const events = rows.map((s) => buildPublicEvent(experiment, s, host));
	return renderEvents(events);
}

/** Researcher feed: public events + reminder events per rule. */
export async function buildResearcherFeed(
	experimentId: string,
	opts: IcsOpts = {}
): Promise<string> {
	const host = opts.host ?? 'localhost';
	const { experiment, sessions: rows } = await loadFeedData(experimentId, opts, true);

	const rules = await db
		.select()
		.from(reminderRules)
		.where(eq(reminderRules.experimentId, experimentId));

	const events: EventAttributes[] = [];
	for (const s of rows) {
		events.push(buildResearcherEvent(experiment, s, host));
		for (const rule of rules) {
			if (reminderMatchesCondition(rule.condition, s)) {
				events.push(buildReminderEvent(experiment, s, rule, host));
			}
		}
	}
	return renderEvents(events);
}

export async function buildSessionFeed(sessionId: string, opts: IcsOpts = {}): Promise<string> {
	const host = opts.host ?? 'localhost';
	const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
	if (rows.length === 0) throw new Error(`session ${sessionId} not found`);
	const session = rows[0];

	const expRows = await db
		.select()
		.from(experiments)
		.where(eq(experiments.id, session.experimentId))
		.limit(1);
	if (expRows.length === 0) throw new Error(`experiment ${session.experimentId} not found`);
	const experiment = expRows[0];

	const events: EventAttributes[] = [];
	if (session.status === 'scheduled' || session.status === 'confirmed') {
		events.push(buildParticipantSessionEvent(experiment, { ...session, confirmedCount: 0 }, host));
	}

	return renderEvents(events);
}
