import { error } from '@sveltejs/kit';
import { getExperimentBySlug } from '$lib/server/experiments';
import { parseRequiredFields } from '$lib/schemas/experiment';
import { sessionsWithCounts } from '$lib/server/sessions';
import { formatInTz } from '$lib/server/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

	const rawSessions = await sessionsWithCounts(experiment.id, { upcomingOnly: true });
	const upcoming = rawSessions
		.filter((s) => s.status === 'scheduled' && s.confirmedCount < s.capacity)
		.slice(0, 5)
		.map((s) => ({
			id: s.id,
			startsAtLabel: formatInTz(s.startsAt),
			endsAtLabel: formatInTz(s.endsAt, undefined, { timeStyle: 'short' }),
			location: s.location,
			confirmedCount: s.confirmedCount,
			capacity: s.capacity
		}));

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
