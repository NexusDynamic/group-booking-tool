import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { buildPrivacyNotice } from '#lib/server/experiments.js';
import { recurringPreferenceFormSchema } from '#lib/schemas/preference.js';
import { parseRequiredFields } from '#lib/schemas/experiment.js';
import { createRecurringPreference } from '#lib/server/preferences.js';
import { parseParticipantSubmission, requirePublishedExperiment } from '#lib/server/public-form.js';
import { buildWeeklyRRule } from '#lib/server/recurrence.js';
import { parseForm } from '#lib/server/validate.js';
import { localToUtc } from '#lib/server/time.js';
import { DATA_RETENTION_DAYS } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await requirePublishedExperiment(params.slug);
	return {
		experiment: { id: experiment.id, slug: experiment.slug, name: experiment.name },
		requiredFields: parseRequiredFields(experiment.requiredFields),
		privacyNotice: buildPrivacyNotice(experiment, DATA_RETENTION_DAYS)
	};
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const experiment = await requirePublishedExperiment(params.slug);

		const formData = await request.formData();
		const submission = parseParticipantSubmission(experiment, formData);
		if (!submission.ok) return submission.failure;

		const parsed = parseForm(recurringPreferenceFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		const { rawToken } = await createRecurringPreference({
			experimentId: experiment.id,
			name: submission.name,
			email: submission.email,
			rrule: buildWeeklyRRule(parsed.data.byDay),
			dtstartLocal: parsed.data.dtstartLocal,
			durationMinutes: parsed.data.durationMinutes,
			windowStart: parsed.data.windowStart ? localToUtc(`${parsed.data.windowStart}T00:00`) : null,
			windowEnd: parsed.data.windowEnd ? localToUtc(`${parsed.data.windowEnd}T23:59`) : null,
			notes: parsed.data.notes,
			snapshotFields: submission.snapshotFields
		});

		throw redirect(303, resolve(`e/${experiment.slug}/preference/${rawToken}`));
	}
};
