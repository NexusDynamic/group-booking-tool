import { error, fail } from '@sveltejs/kit';
import { getExperimentById } from '$lib/server/experiments';
import {
	assignPreferenceToSessions,
	declinePreference,
	getPreferenceById,
	listPreferencesForExperiment,
	suggestMatchingSessions
} from '$lib/server/preferences';
import { formatInTz } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const raw = await listPreferencesForExperiment(experiment.id);

	// For each pending preference, compute matching sessions up-front so the
	// researcher sees suggestions inline without extra clicks.
	const preferences = await Promise.all(
		raw.map(async (p) => {
			const matches =
				p.status === 'pending'
					? (await suggestMatchingSessions(p)).map((m) => ({
							id: m.id,
							startsAtLabel: formatInTz(m.startsAt),
							capacity: m.capacity
						}))
					: [];
			return {
				id: p.id,
				status: p.status,
				kind: p.kind,
				snapshotName: p.snapshotName,
				snapshotEmail: p.snapshotEmail,
				rrule: p.rrule,
				dtstartLocal: p.dtstartLocal,
				durationMinutes: p.durationMinutes,
				notes: p.notes,
				createdAtLabel: formatInTz(p.createdAt),
				matches
			};
		})
	);

	return { experiment, preferences };
};

export const actions: Actions = {
	assign: async ({ request }) => {
		const formData = await request.formData();
		const preferenceId = String(formData.get('preferenceId') ?? '');
		const sessionIds = formData.getAll('sessionIds').filter((v) => typeof v === 'string') as string[];
		if (!preferenceId || sessionIds.length === 0) {
			return fail(400, { error: 'Pick at least one session to assign.' });
		}
		const pref = await getPreferenceById(preferenceId);
		if (!pref) return fail(404, { error: 'Preference not found' });
		const { created, errors } = await assignPreferenceToSessions(preferenceId, sessionIds);
		if (errors.length > 0) {
			return fail(409, {
				error: `Assigned ${created}/${sessionIds.length}. Errors: ${errors.map((e) => e.message).join('; ')}`
			});
		}
		return { assigned: true, created };
	},

	decline: async ({ request }) => {
		const formData = await request.formData();
		const preferenceId = String(formData.get('preferenceId') ?? '');
		if (!preferenceId) return fail(400, { error: 'Missing preference id' });
		await declinePreference(preferenceId);
		return { declined: true };
	}
};
