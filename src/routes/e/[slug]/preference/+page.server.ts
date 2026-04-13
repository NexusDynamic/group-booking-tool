import { error, fail, redirect } from '@sveltejs/kit';
import { buildPrivacyNotice, getExperimentBySlug } from '$lib/server/experiments';
import { recurringPreferenceFormSchema } from '$lib/schemas/preference';
import { createRecurringPreference } from '$lib/server/preferences';
import { buildWeeklyRRule } from '$lib/server/recurrence';
import { parseForm } from '$lib/server/validate';
import { localToUtc } from '$lib/server/time';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');
	return {
		experiment: { id: experiment.id, slug: experiment.slug, name: experiment.name },
		privacyNotice: buildPrivacyNotice(experiment, Number(env.DATA_RETENTION_DAYS ?? 90))
	};
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const experiment = await getExperimentBySlug(params.slug);
		if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

		const formData = await request.formData();
		const parsed = parseForm(recurringPreferenceFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		if (parsed.data.honeypot) {
			return fail(400, { error: 'Submission rejected.' });
		}

		const { rawToken } = await createRecurringPreference({
			experimentId: experiment.id,
			name: parsed.data.name,
			email: parsed.data.email,
			rrule: buildWeeklyRRule(parsed.data.byDay),
			dtstartLocal: parsed.data.dtstartLocal,
			durationMinutes: parsed.data.durationMinutes,
			windowStart: parsed.data.windowStart ? localToUtc(`${parsed.data.windowStart}T00:00`) : null,
			windowEnd: parsed.data.windowEnd ? localToUtc(`${parsed.data.windowEnd}T23:59`) : null,
			notes: parsed.data.notes
		});

		throw redirect(303, `/e/${experiment.slug}/preference/${rawToken}`);
	}
};
