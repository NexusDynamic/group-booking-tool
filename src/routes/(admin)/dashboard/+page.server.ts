import { loadDashboard } from '#lib/server/dashboard.js';
import { formatInTz } from '#lib/server/time.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const dashboard = await loadDashboard({ upcomingLimit: 10 });
	return {
		user: locals.user!,
		counts: dashboard.counts,
		upcoming: dashboard.upcoming.map((u) => ({
			...u,
			startsAtLabel: formatInTz(u.startsAt),
			endsAtLabel: formatInTz(u.endsAt)
		}))
	};
};
