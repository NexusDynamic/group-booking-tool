import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { buildPrivacyNotice, getExperimentBySlug } from '$lib/server/experiments';
import { parseRequiredFields } from '$lib/schemas/experiment';
import { sessionsWithCounts } from '$lib/server/sessions';
import { bookingSchemaFor } from '$lib/schemas/booking';
import {
	createBooking,
	PriorAttendanceError,
	SessionFullError,
	upsertParticipant
} from '$lib/server/bookings';
import { hasPriorAttendance } from '$lib/server/exclusions';
import { formatInTz } from '$lib/server/time';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

	const raw = await sessionsWithCounts(experiment.id, { upcomingOnly: true });
	const sessions = raw
		.filter((s) => s.status === 'scheduled')
		.map((s) => ({
			id: s.id,
			startsAtLabel: formatInTz(s.startsAt),
			endsAtLabel: formatInTz(s.endsAt, undefined, { timeStyle: 'short' }),
			confirmedCount: s.confirmedCount,
			capacity: s.capacity,
			location: s.location,
			isFull: s.confirmedCount >= s.capacity
		}));

	return {
		experiment: {
			id: experiment.id,
			slug: experiment.slug,
			name: experiment.name
		},
		sessions,
		requiredFields: parseRequiredFields(experiment.requiredFields),
		privacyNotice: buildPrivacyNotice(experiment, Number(env.DATA_RETENTION_DAYS ?? 90))
	};
};

export const actions: Actions = {
	book: async ({ request, params }) => {
		const experiment = await getExperimentBySlug(params.slug);
		if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

		const formData = await request.formData();
		const sessionId = String(formData.get('sessionId') ?? '');
		if (!sessionId) return fail(400, { error: 'Please pick a session.' });

		const requiredFields = parseRequiredFields(experiment.requiredFields);
		const schema = bookingSchemaFor(requiredFields);

		const values: Record<string, string> = {};
		for (const [k, v] of formData.entries()) {
			if (typeof v === 'string') values[k] = v;
		}
		const result = schema.safeParse(values);
		if (!result.success) {
			const errors: Record<string, string> = {};
			for (const issue of result.error.issues) {
				const path = issue.path.join('.') || '_';
				if (!errors[path]) errors[path] = issue.message;
			}
			return fail(400, { errors, values, sessionId });
		}

		// Honeypot — reject silently-ish.
		if (values.honeypot && values.honeypot.length > 0) {
			return fail(400, { error: 'Submission rejected.', values, sessionId });
		}

		// Privacy notice acknowledgement — required.
		if (values.consent !== 'on') {
			const errors: Record<string, string> = {
				consent: 'You must acknowledge the privacy notice to continue.'
			};
			return fail(400, { errors, values, sessionId });
		}

		// Upsert participant, check exclusion, then create booking atomically.
		// Zod's extended dynamic schema widens the result to unknown; cast back.
		const parsedData = result.data as {
			name: string;
			email: string;
			[key: string]: unknown;
		};
		const participant = await upsertParticipant({
			email: parsedData.email,
			displayName: parsedData.name
		});

		if (experiment.excludePriorAttendees) {
			const blocked = await hasPriorAttendance(participant.id, experiment.id);
			if (blocked) {
				return fail(403, {
					error: 'You have already taken part in this experiment and cannot sign up again.',
					values,
					sessionId
				});
			}
		}

		// Extract experiment-specific fields into a snapshot object.
		const snapshotFields: Record<string, unknown> = {};
		for (const f of requiredFields) {
			const key = `field_${f.key}`;
			if (key in parsedData) {
				snapshotFields[f.key] = parsedData[key];
			}
		}

		try {
			const { rawToken } = await createBooking({
				sessionId,
				participantId: participant.id,
				snapshotName: parsedData.name,
				snapshotEmail: parsedData.email,
				snapshotFields
			});
			throw redirect(303, resolve(`/e/${experiment.slug}/booked/${rawToken}`));
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
			throw err;
		}
	}
};
