import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { buildPrivacyNotice } from '#lib/server/experiments.js';
import { parseRequiredFields } from '#lib/schemas/experiment.js';
import {
	AlreadyBookedError,
	BookingStateError,
	createBooking,
	PriorAttendanceError,
	SessionFullError,
	upsertParticipant
} from '#lib/server/bookings.js';
import {
	listOpenSessions,
	parseParticipantSubmission,
	requirePublishedExperiment
} from '#lib/server/public-form.js';
import { formId } from '#lib/server/validate.js';
import { CLINIC_TZ } from '#lib/server/time.js';
import { DATA_RETENTION_DAYS } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await requirePublishedExperiment(params.slug);

	return {
		experiment: {
			id: experiment.id,
			slug: experiment.slug,
			name: experiment.name
		},
		sessions: await listOpenSessions(experiment.id),
		requiredFields: parseRequiredFields(experiment.requiredFields),
		privacyNotice: buildPrivacyNotice(experiment, DATA_RETENTION_DAYS),
		clinicTz: CLINIC_TZ
	};
};

export const actions: Actions = {
	book: async ({ request, params }) => {
		const experiment = await requirePublishedExperiment(params.slug);

		const formData = await request.formData();
		const sessionId = formId(formData, 'sessionId');
		if (!sessionId) return fail(400, { error: 'Please pick a session.' });

		const submission = parseParticipantSubmission(experiment, formData, { sessionId });
		if (!submission.ok) return submission.failure;
		const { values } = submission;

		const participant = await upsertParticipant({
			email: submission.email,
			displayName: submission.name
		});

		// createBooking checks, in one transaction, that the session belongs to
		// this experiment and is still open, the prior-attendance exclusion,
		// and capacity.
		let rawToken: string;
		try {
			({ rawToken } = await createBooking({
				experimentId: experiment.id,
				sessionId,
				participantId: participant.id,
				snapshotName: submission.name,
				snapshotEmail: submission.email,
				snapshotFields: submission.snapshotFields
			}));
		} catch (err) {
			if (err instanceof SessionFullError) {
				return fail(409, {
					error: 'This session filled up while you were booking. Please pick another.',
					values,
					sessionId
				});
			}
			if (err instanceof PriorAttendanceError) {
				return fail(403, { error: err.message, values, sessionId });
			}
			if (err instanceof AlreadyBookedError) {
				return fail(409, { error: err.message, values, sessionId });
			}
			if (err instanceof BookingStateError) {
				return fail(409, {
					error: 'That session is no longer available. Please pick another.',
					values,
					sessionId: ''
				});
			}
			throw err;
		}

		throw redirect(303, resolve(`e/${experiment.slug}/booked/${rawToken}`));
	}
};
