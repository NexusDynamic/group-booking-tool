import { error, fail, type ActionFailure } from '@sveltejs/kit';
import { bookingSchemaFor } from '#lib/schemas/booking.js';
import { parseRequiredFields } from '#lib/schemas/experiment.js';
import { getExperimentBySlug, type Experiment } from './experiments';
import { sessionsWithCounts } from './sessions';
import { isOpenStatus } from './session-status';
import { formatInTz } from './time';
import { formValues, zodErrors } from './validate';

/**
 * Shared plumbing for the public participant routes under `/e/[slug]`.
 */

/** Load a published experiment by slug or 404. */
export async function requirePublishedExperiment(slug: string): Promise<Experiment> {
	const experiment = await getExperimentBySlug(slug);
	if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');
	return experiment;
}

export interface PublicSession {
	id: string;
	startsAtLabel: string;
	endsAtLabel: string;
	location: string;
	confirmedCount: number;
	capacity: number;
	isFull: boolean;
}

/**
 * Upcoming sessions a participant may sign up for: anything not cancelled /
 * completed. Sessions stay listed once their minimum is met (`confirmed`)
 * and once full — `isFull` is what disables a slot in the UI.
 */
export async function listOpenSessions(experimentId: string): Promise<PublicSession[]> {
	const raw = await sessionsWithCounts(experimentId, { upcomingOnly: true });
	return raw
		.filter((s) => isOpenStatus(s.status))
		.map((s) => ({
			id: s.id,
			startsAtLabel: formatInTz(s.startsAt),
			endsAtLabel: formatInTz(s.endsAt, undefined, { timeStyle: 'short' }),
			location: s.location,
			confirmedCount: s.confirmedCount,
			capacity: s.capacity,
			isFull: s.confirmedCount >= s.capacity
		}));
}

type SubmissionFailure<E> = ActionFailure<
	{
		error?: string;
		errors?: Record<string, string>;
		values: Record<string, string>;
	} & E
>;

export type ParticipantSubmission<E> =
	| {
			ok: true;
			name: string;
			email: string;
			/** Experiment-specific answers keyed by required-field key. */
			snapshotFields: Record<string, unknown>;
			values: Record<string, string>;
	  }
	| { ok: false; failure: SubmissionFailure<E> };

/**
 * Validate the part every public sign-up form shares: honeypot, name, email,
 * the experiment's required fields, and the privacy-notice acknowledgement.
 *
 * `extra` is merged into any failure payload (e.g. the selected session id)
 * so the page can restore its state.
 */
export function parseParticipantSubmission<E extends object = object>(
	experiment: Experiment,
	formData: FormData,
	extra?: E
): ParticipantSubmission<E> {
	const values = formValues(formData);
	const failWith = (
		status: number,
		body: { error?: string; errors?: Record<string, string> }
	): ParticipantSubmission<E> => ({
		ok: false,
		failure: fail(status, { ...body, values, ...(extra as E) })
	});

	// Honeypot — real users never see or fill this field.
	if (values.honeypot) return failWith(400, { error: 'Submission rejected.' });

	const requiredFields = parseRequiredFields(experiment.requiredFields);
	const result = bookingSchemaFor(requiredFields).safeParse(values);
	if (!result.success) return failWith(400, { errors: zodErrors(result.error) });

	// Privacy notice acknowledgement — required.
	if (values.consent !== 'on') {
		return failWith(400, {
			errors: { consent: 'You must acknowledge the privacy notice to continue.' }
		});
	}

	// Zod's extended dynamic schema widens the result to unknown; cast back.
	const data = result.data as { name: string; email: string; [key: string]: unknown };
	const snapshotFields: Record<string, unknown> = {};
	for (const f of requiredFields) {
		const key = `field_${f.key}`;
		if (key in data) snapshotFields[f.key] = data[key];
	}

	return { ok: true, name: data.name, email: data.email, snapshotFields, values };
}
