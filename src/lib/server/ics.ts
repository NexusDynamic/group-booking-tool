import { createEvents, type EventAttributes, type DateArray } from 'ics';
import { and, asc, eq, gte, inArray, isNull } from 'drizzle-orm';
import { db } from './db';
import { bookings, experiments, reminderRules, sessions } from './db/schema';
import { isOpenStatus } from './session-status';
import { confirmedCounts } from './sessions';
import { CLINIC_TZ, tzParts } from './time';

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

/** Tolerant parse of a booking's `snapshot_fields` JSON blob. */
function parseFormValues(raw: string): Record<string, string> {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, string>;
		}
	} catch {
		// fall through
	}
	return {};
}

function sessionStatusToIcsStatus(status: string): 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE' {
	switch (status) {
		case 'scheduled':
			return 'CONFIRMED';
		case 'cancelled':
			return 'CANCELLED';
		default:
			return 'CONFIRMED';
	}
}

function sessionStatusForEventName(status: string): string {
	switch (status) {
		case 'scheduled':
			return '[BOOKED] ';
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
): Promise<{ experiment: Experiment; sessions: SessionRow[] }> {
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

	const filtered = sessionRows.filter((r) => isOpenStatus(r.status) && r.startsAt <= cutoff);

	const sessionIds = filtered.map((s) => s.id);
	const countsBySession = await confirmedCounts(sessionIds);

	// Researcher feed only: who is booked, with their form answers. Anonymised
	// bookings still count above, but carry no details to list.
	const participantInfoBySession = new Map<string, ParticipantInSession[]>();
	if (includeParticipants && sessionIds.length > 0) {
		const bookingRows = await db
			.select()
			.from(bookings)
			.where(
				and(
					inArray(bookings.sessionId, sessionIds),
					eq(bookings.status, 'confirmed'),
					isNull(bookings.anonymisedAt)
				)
			);
		for (const b of bookingRows) {
			if (!b.snapshotEmail) continue;
			const participantInfo = participantInfoBySession.get(b.sessionId) ?? [];
			participantInfo.push({
				participantEmail: b.snapshotEmail,
				participantName: b.snapshotName,
				participantFormValues: parseFormValues(b.snapshotFields)
			});
			participantInfoBySession.set(b.sessionId, participantInfo);
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

export function toLocalDateArray(d: Date): DateArray {
	// Wall-clock components in CLINIC_TZ, emitted as floating local time.
	const w = tzParts(d, CLINIC_TZ);
	return [w.year, w.month, w.day, w.hour, w.minute];
}

type Experiment = typeof experiments.$inferSelect;

/**
 * Common shape of every event we emit: floating clinic-local start/end with
 * the experimenter as organizer and sole (accepted) attendee.
 */
function baseEvent(
	exp: Experiment,
	attrs: {
		uid: string;
		title: string;
		description: string;
		location?: string;
		start: Date;
		end: Date;
		status: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
	}
): EventAttributes {
	const organizer = { name: exp.experimenterName, email: exp.experimenterEmail };
	return {
		uid: attrs.uid,
		title: attrs.title,
		description: attrs.description,
		location: attrs.location,
		start: toLocalDateArray(attrs.start),
		end: toLocalDateArray(attrs.end),
		startInputType: 'local',
		endInputType: 'local',
		startOutputType: 'local',
		endOutputType: 'local',
		status: attrs.status,
		organizer,
		attendees: [{ ...organizer, rsvp: true, role: 'CHAIR', partstat: 'ACCEPTED' }]
	};
}

/** The event for a session itself, shared by all three feeds. */
function sessionEvent(
	exp: Experiment,
	s: SessionRow,
	host: string,
	opts: { showCount: boolean; description?: string }
): EventAttributes {
	const count = opts.showCount ? ` (${s.confirmedCount}/${s.capacity})` : '';
	return baseEvent(exp, {
		uid: `${s.id}@${host}`,
		title: `${sessionStatusForEventName(s.status)}${exp.name}${count}`,
		description: opts.description ?? exp.description,
		location: s.location || undefined,
		start: s.startsAt,
		end: s.endsAt,
		status: sessionStatusToIcsStatus(s.status)
	});
}

/** Experiment description plus who is booked and what they answered. */
function researcherDescription(exp: Experiment, s: SessionRow): string {
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
	return description;
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
	exp: Experiment,
	s: SessionRow,
	rule: typeof reminderRules.$inferSelect,
	host: string
): EventAttributes {
	const reminderStart = new Date(s.startsAt.getTime() - rule.offsetMinutesBefore * 60 * 1000);
	const reminderEnd = new Date(reminderStart.getTime() + rule.durationMinutes * 60 * 1000);
	return baseEvent(exp, {
		uid: `${s.id}-reminder-${rule.id}@${host}`,
		title: `${rule.label} — ${exp.name} (${s.confirmedCount}/${s.capacity})`,
		description: `Reminder for session ${s.id}. Current booking count: ${s.confirmedCount}/${s.capacity}. Minimum: ${s.minParticipants}.`,
		start: reminderStart,
		end: reminderEnd,
		status: 'CONFIRMED'
	});
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
	const events = rows.map((s) => sessionEvent(experiment, s, host, { showCount: true }));
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
		events.push(
			sessionEvent(experiment, s, host, {
				showCount: true,
				description: researcherDescription(experiment, s)
			})
		);
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
	if (isOpenStatus(session.status)) {
		events.push(
			sessionEvent(experiment, { ...session, confirmedCount: 0 }, host, { showCount: false })
		);
	}

	return renderEvents(events);
}

/**
 * Wrap a rendered feed in a `text/calendar` response. `public` feeds carry no
 * participant data and may be cached by intermediaries.
 */
export function icsResponse(body: string, visibility: 'public' | 'private'): Response {
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'cache-control': `${visibility}, max-age=60`
		}
	});
}
