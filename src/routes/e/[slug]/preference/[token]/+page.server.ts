import { error } from '@sveltejs/kit';
import { getExperimentBySlug } from '$lib/server/experiments';
import {
	findPreferenceByToken,
	withdrawPreferenceByToken
} from '$lib/server/preferences';
import { formatInTz } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment) throw error(404, 'Experiment not found');
	const preference = await findPreferenceByToken(params.token);
	if (!preference || preference.experimentId !== experiment.id) {
		throw error(404, 'This link is not valid');
	}
	return {
		experiment: { slug: experiment.slug, name: experiment.name },
		preference: {
			kind: preference.kind,
			status: preference.status,
			snapshotName: preference.snapshotName,
			snapshotEmail: preference.snapshotEmail,
			rrule: preference.rrule,
			dtstartLocal: preference.dtstartLocal,
			durationMinutes: preference.durationMinutes,
			windowStartLabel: preference.windowStart ? formatInTz(preference.windowStart, undefined, { dateStyle: 'medium' }) : null,
			windowEndLabel: preference.windowEnd ? formatInTz(preference.windowEnd, undefined, { dateStyle: 'medium' }) : null,
			notes: preference.notes
		}
	};
};

export const actions: Actions = {
	withdraw: async ({ params }) => {
		await withdrawPreferenceByToken(params.token);
		return { withdrawn: true };
	}
};
