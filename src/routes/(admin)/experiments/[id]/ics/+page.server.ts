import { error, fail } from '@sveltejs/kit';
import { getExperimentById, rotateIcsToken } from '$lib/server/experiments';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const origin = url.origin;
	return {
		experiment,
		publicUrl: `${origin}/ics/experiment/${experiment.publicIcsToken}.ics`,
		researcherUrl: `${origin}/ics/researcher/${experiment.researcherIcsToken}.ics`
	};
};

export const actions: Actions = {
	rotatePublic: async ({ params }) => {
		await rotateIcsToken(params.id, 'public');
		return { rotated: 'public' };
	},
	rotateResearcher: async ({ params }) => {
		await rotateIcsToken(params.id, 'researcher');
		return { rotated: 'researcher' };
	}
};
