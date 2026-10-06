import { parseRequiredFields } from '#lib/schemas/experiment.js';
import { listOpenSessions, requirePublishedExperiment } from '#lib/server/public-form.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await requirePublishedExperiment(params.slug);

	const upcoming = (await listOpenSessions(experiment.id)).filter((s) => !s.isFull).slice(0, 5);

	return {
		experiment: {
			id: experiment.id,
			slug: experiment.slug,
			name: experiment.name,
			description: experiment.description,
			durationMinutes: experiment.durationMinutes,
			inclusionCriteria: experiment.inclusionCriteria,
			exclusionCriteria: experiment.exclusionCriteria
		},
		upcoming,
		requiredFields: parseRequiredFields(experiment.requiredFields)
	};
};
