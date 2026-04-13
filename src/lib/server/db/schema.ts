import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// -----------------------------------------------------------------------------
// Group booking tool — domain schema
//
// Conventions:
//  - Primary keys are text `crypto.randomUUID()` values.
//  - Timestamps use SQLite `integer` with Drizzle `timestamp_ms` mode (UTC).
//  - JSON columns are stored as text and parsed/serialised in app code.
//  - Booleans are stored as integers with `mode: 'boolean'`.
// -----------------------------------------------------------------------------

const pk = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.notNull();

const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`)
		.$onUpdate(() => new Date())
		.notNull();

// -----------------------------------------------------------------------------
// experiments
// -----------------------------------------------------------------------------
export const experiments = sqliteTable(
	'experiments',
	{
		id: pk(),
		slug: text('slug').notNull(),
		name: text('name').notNull(),
		description: text('description').notNull().default(''),
		durationMinutes: integer('duration_minutes').notNull(),
		inclusionCriteria: text('inclusion_criteria').notNull().default(''),
		exclusionCriteria: text('exclusion_criteria').notNull().default(''),
		minParticipants: integer('min_participants').notNull().default(1),
		maxParticipants: integer('max_participants').notNull().default(1),
		// JSON: [{ key, label, type: 'text' | 'email' | 'number' | 'checkbox', required }]
		requiredFields: text('required_fields').notNull().default('[]'),
		excludePriorAttendees: integer('exclude_prior_attendees', { mode: 'boolean' })
			.notNull()
			.default(true),
		experimenterName: text('experimenter_name').notNull().default('Experimenter'),
		experimenterEmail: text('experimenter_email').notNull().default('experimenter@example.com'),
		location: text('location').notNull().default(''),
		notes: text('notes').notNull().default(''),
		isPublished: integer('is_published', { mode: 'boolean' }).notNull().default(false),
		publicIcsToken: text('public_ics_token').notNull(),
		researcherIcsToken: text('researcher_ics_token').notNull(),
		// GDPR: days after a session ends before participant data is anonymised.
		// null = use the global DATA_RETENTION_DAYS environment variable (default 90).
		dataRetentionDays: integer('data_retention_days'),
		// Free-text notice shown to participants at sign-up (Art. 13 GDPR).
		// If blank, a default notice is generated from retention period + contact email.
		privacyNoticeText: text('privacy_notice_text').notNull().default(''),
		// Optional URL to a full privacy policy page.
		privacyNoticeUrl: text('privacy_notice_url').notNull().default(''),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		uniqueIndex('experiments_slug_idx').on(t.slug),
		uniqueIndex('experiments_public_ics_token_idx').on(t.publicIcsToken),
		uniqueIndex('experiments_researcher_ics_token_idx').on(t.researcherIcsToken)
	]
);

// -----------------------------------------------------------------------------
// recurrence_templates
// -----------------------------------------------------------------------------
export const recurrenceTemplates = sqliteTable(
	'recurrence_templates',
	{
		id: pk(),
		experimentId: text('experiment_id')
			.notNull()
			.references(() => experiments.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		// RFC 5545 RRULE string, e.g. "FREQ=WEEKLY;BYDAY=MO"
		rrule: text('rrule').notNull(),
		// ISO local datetime in CLINIC_TZ, e.g. "2026-06-01T09:00". Wall-clock source of truth.
		dtstartLocal: text('dtstart_local').notNull(),
		durationMinutes: integer('duration_minutes').notNull(),
		capacity: integer('capacity').notNull(),
		minParticipants: integer('min_participants').notNull(),
		location: text('location').notNull().default(''),
		notes: text('notes').notNull().default(''),
		windowStart: integer('window_start', { mode: 'timestamp_ms' }),
		windowEnd: integer('window_end', { mode: 'timestamp_ms' }),
		createdAt: createdAt()
	},
	(t) => [index('recurrence_templates_experiment_idx').on(t.experimentId)]
);

// -----------------------------------------------------------------------------
// sessions (concrete bookable time slots)
// -----------------------------------------------------------------------------
export const sessions = sqliteTable(
	'sessions',
	{
		id: pk(),
		experimentId: text('experiment_id')
			.notNull()
			.references(() => experiments.id, { onDelete: 'cascade' }),
		sourceTemplateId: text('source_template_id').references(() => recurrenceTemplates.id, {
			onDelete: 'set null'
		}),
		startsAt: integer('starts_at', { mode: 'timestamp_ms' }).notNull(),
		endsAt: integer('ends_at', { mode: 'timestamp_ms' }).notNull(),
		capacity: integer('capacity').notNull(),
		minParticipants: integer('min_participants').notNull(),
		location: text('location').notNull().default(''),
		// 'scheduled' | 'cancelled' | 'completed'
		status: text('status').notNull().default('scheduled'),
		notes: text('notes').notNull().default(''),
		publicIcsToken: text('public_ics_token').notNull(),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('sessions_experiment_starts_idx').on(t.experimentId, t.startsAt),
		index('sessions_starts_idx').on(t.startsAt),
		// partial unique: prevent duplicate materialisations of the same template instance
		uniqueIndex('sessions_template_starts_idx')
			.on(t.sourceTemplateId, t.startsAt)
			.where(sql`source_template_id IS NOT NULL`),
		uniqueIndex('sessions_public_ics_token_idx').on(t.publicIcsToken)
	]
);

// -----------------------------------------------------------------------------
// participants (dedupe-by-email registry; not an auth table)
// -----------------------------------------------------------------------------
export const participants = sqliteTable(
	'participants',
	{
		id: pk(),
		emailNormalised: text('email_normalised').notNull(),
		displayName: text('display_name'),
		// Set when GDPR anonymisation runs; emailNormalised is replaced with
		// '<anonymized:{id}>' so the unique constraint is preserved.
		anonymisedAt: integer('anonymised_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('participants_email_idx').on(t.emailNormalised)]
);

// -----------------------------------------------------------------------------
// bookings (snapshot-at-booking-time, with self-manage token hash)
// -----------------------------------------------------------------------------
export const bookings = sqliteTable(
	'bookings',
	{
		id: pk(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		participantId: text('participant_id')
			.notNull()
			.references(() => participants.id),
		snapshotName: text('snapshot_name').notNull(),
		snapshotEmail: text('snapshot_email').notNull(),
		// JSON object: { [requiredFieldKey]: value }
		snapshotFields: text('snapshot_fields').notNull().default('{}'),
		// 'confirmed' | 'cancelled' | 'attended' | 'no_show'
		status: text('status').notNull().default('confirmed'),
		// sha256 hex of a 32-byte random token; raw token lives only in the URL after creation
		manageTokenHash: text('manage_token_hash').notNull(),
		// Set when snapshot fields are scrubbed during GDPR anonymisation.
		anonymisedAt: integer('anonymised_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('bookings_session_status_idx').on(t.sessionId, t.status),
		index('bookings_participant_status_idx').on(t.participantId, t.status),
		uniqueIndex('bookings_manage_token_idx').on(t.manageTokenHash)
	]
);

// -----------------------------------------------------------------------------
// booking_preferences (standing queue awaiting researcher assignment)
// -----------------------------------------------------------------------------
export const bookingPreferences = sqliteTable(
	'booking_preferences',
	{
		id: pk(),
		experimentId: text('experiment_id')
			.notNull()
			.references(() => experiments.id, { onDelete: 'cascade' }),
		participantId: text('participant_id')
			.notNull()
			.references(() => participants.id),
		snapshotName: text('snapshot_name').notNull(),
		snapshotEmail: text('snapshot_email').notNull(),
		snapshotFields: text('snapshot_fields').notNull().default('{}'),
		// 'recurring' | 'session_list'
		kind: text('kind').notNull(),
		// populated when kind = 'recurring'
		rrule: text('rrule'),
		dtstartLocal: text('dtstart_local'),
		durationMinutes: integer('duration_minutes'),
		windowStart: integer('window_start', { mode: 'timestamp_ms' }),
		windowEnd: integer('window_end', { mode: 'timestamp_ms' }),
		// JSON array of session ids; populated when kind = 'session_list'
		preferredSessionIds: text('preferred_session_ids').notNull().default('[]'),
		notes: text('notes').notNull().default(''),
		// 'pending' | 'assigned' | 'declined' | 'withdrawn'
		status: text('status').notNull().default('pending'),
		manageTokenHash: text('manage_token_hash').notNull(),
		// Set when snapshot fields are scrubbed during GDPR anonymisation.
		anonymisedAt: integer('anonymised_at', { mode: 'timestamp_ms' }),
		createdAt: createdAt(),
		updatedAt: updatedAt()
	},
	(t) => [
		index('booking_preferences_experiment_status_idx').on(t.experimentId, t.status),
		uniqueIndex('booking_preferences_manage_token_idx').on(t.manageTokenHash)
	]
);

// -----------------------------------------------------------------------------
// reminder_rules (researcher ICS feed extras)
// -----------------------------------------------------------------------------
export const reminderRules = sqliteTable(
	'reminder_rules',
	{
		id: pk(),
		experimentId: text('experiment_id')
			.notNull()
			.references(() => experiments.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		offsetMinutesBefore: integer('offset_minutes_before').notNull(),
		// 'always' | 'below_minimum' | 'at_capacity'
		condition: text('condition').notNull().default('always'),
		durationMinutes: integer('duration_minutes').notNull().default(15),
		createdAt: createdAt()
	},
	(t) => [index('reminder_rules_experiment_idx').on(t.experimentId)]
);

// re-export better-auth generated tables so drizzle-kit sees them
export * from './auth.schema';
