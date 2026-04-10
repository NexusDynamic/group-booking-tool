import { listParticipantsWithActivity } from '$lib/server/dashboard';
import { formatInTz } from '$lib/server/time';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await listParticipantsWithActivity();
	return {
		participants: rows.map((p) => ({
			...p,
			lastBookingLabel: p.lastBookingAt ? formatInTz(p.lastBookingAt) : null
		}))
	};
};
