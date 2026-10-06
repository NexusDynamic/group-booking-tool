import { fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { buildPrivacyNotice } from '#lib/server/experiments.js';
import { sessionListPreferenceFormSchema } from '#lib/schemas/preference.js';
import { parseRequiredFields } from '#lib/schemas/experiment.js';
import { createSessionListPreference } from '#lib/server/preferences.js';
import {
	listOpenSessions,
	parseParticipantSubmission,
	requirePublishedExperiment
} from '#lib/server/public-form.js';
import { parseForm } from '#lib/server/validate.js';
import { DATA_RETENTION_DAYS } from '$app/env/private';
import type { Actions, PageServerLoad } from './$types';

/** Upper bound on how many candidate sessions one preference may list. */
const MAX_CANDIDATE_SESSIONS = 50;

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await requirePublishedExperiment(params.slug);
	return {
		experiment: { id: experiment.id, slug: experiment.slug, name: experiment.name },
		sessions: await listOpenSessions(experiment.id),
		requiredFields: parseRequiredFields(experiment.requiredFields),
		privacyNotice: buildPrivacyNotice(experiment, DATA_RETENTION_DAYS)
	};
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const experiment = await requirePublishedExperiment(params.slug);

		const formData = await request.formData();
		// Collect all `sessionIds` values (repeated checkbox name) and fold
		// into a single CSV for the schema.
		const ids = formData.getAll('sessionIds').filter((v) => typeof v === 'string') as string[];
		formData.set('sessionIds', ids.join(','));

		const submission = parseParticipantSubmission(experiment, formData);
		if (!submission.ok) return submission.failure;

		const parsed = parseForm(sessionListPreferenceFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		// The ids come from the client: keep only sessions that are actually
		// on offer for this experiment.
		const open = new Set((await listOpenSessions(experiment.id)).map((s) => s.id));
		const sessionIds = [...new Set(ids)].filter((id) => open.has(id));
		if (sessionIds.length === 0 || sessionIds.length > MAX_CANDIDATE_SESSIONS) {
			return fail(400, {
				errors: {
					sessionIds:
						sessionIds.length === 0
							? 'Pick at least one session'
							: `Pick at most ${MAX_CANDIDATE_SESSIONS} sessions`
				} as Record<string, string>,
				values: submission.values
			});
		}

		const { rawToken } = await createSessionListPreference({
			experimentId: experiment.id,
			name: submission.name,
			email: submission.email,
			sessionIds,
			notes: parsed.data.notes,
			snapshotFields: submission.snapshotFields
		});

		throw redirect(303, resolve(`e/${experiment.slug}/preference/${rawToken}`));
	}
};
