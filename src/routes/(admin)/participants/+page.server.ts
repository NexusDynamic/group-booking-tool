import { fail } from '@sveltejs/kit';
import { listParticipantsWithActivity } from '#lib/server/dashboard.js';
import { forceAnonymiseParticipant, runAnonymizationJob } from '#lib/server/anonymization.js';
import { db } from '#lib/server/db/index.js';
import { formatInTz } from '#lib/server/time.js';
import { DATA_RETENTION_DAYS } from '$app/env/private';
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
		const defaultRetentionDays = DATA_RETENTION_DAYS;
		const result = await runAnonymizationJob(db, { defaultRetentionDays });
		return { jobResult: result };
	}
};
