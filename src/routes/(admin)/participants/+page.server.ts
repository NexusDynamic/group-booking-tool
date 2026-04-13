import { fail } from '@sveltejs/kit';
import { listParticipantsWithActivity } from '$lib/server/dashboard';
import { forceAnonymiseParticipant, runAnonymizationJob } from '$lib/server/anonymization';
import { db } from '$lib/server/db';
import { formatInTz } from '$lib/server/time';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const rows = await listParticipantsWithActivity();
	return {
		participants: rows.map((p) => ({
			...p,
			lastBookingLabel: p.lastBookingAt ? formatInTz(p.lastBookingAt) : null
		}))
	};
};

export const actions: Actions = {
	anonymise: async ({ request }) => {
		const formData = await request.formData();
		const participantId = String(formData.get('participantId') ?? '');
		if (!participantId) return fail(400, { error: 'Missing participantId' });
		await forceAnonymiseParticipant(db, participantId);
		return { anonymised: participantId };
	},

	runJob: async () => {
		const defaultRetentionDays = Number(env.DATA_RETENTION_DAYS ?? 90);
		const result = await runAnonymizationJob(db, { defaultRetentionDays });
		return { jobResult: result };
	}
};
