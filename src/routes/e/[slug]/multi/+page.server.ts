import { error, fail, redirect } from '@sveltejs/kit';
import { buildPrivacyNotice, getExperimentBySlug } from '$lib/server/experiments';
import { sessionsWithCounts } from '$lib/server/sessions';
import { sessionListPreferenceFormSchema } from '$lib/schemas/preference';
import { createSessionListPreference } from '$lib/server/preferences';
import { parseForm } from '$lib/server/validate';
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
			isFull: s.confirmedCount >= s.capacity
		}));
	return {
		experiment: { id: experiment.id, slug: experiment.slug, name: experiment.name },
		sessions,
		privacyNotice: buildPrivacyNotice(experiment, Number(env.DATA_RETENTION_DAYS ?? 90))
	};
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const experiment = await getExperimentBySlug(params.slug);
		if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

		const formData = await request.formData();
		// Collect all `sessionIds` values (repeated checkbox name) and fold
		// into a single CSV for the schema.
		const ids = formData.getAll('sessionIds').filter((v) => typeof v === 'string') as string[];
		formData.set('sessionIds', ids.join(','));

		const parsed = parseForm(sessionListPreferenceFormSchema, formData);
		if (!parsed.ok) return parsed.failure;
		if (parsed.data.honeypot) return fail(400, { error: 'Submission rejected.' });

		const { rawToken } = await createSessionListPreference({
			experimentId: experiment.id,
			name: parsed.data.name,
			email: parsed.data.email,
			sessionIds: parsed.data.sessionIds.split(',').filter(Boolean),
			notes: parsed.data.notes
		});

		throw redirect(303, `/e/${experiment.slug}/preference/${rawToken}`);
	}
};
