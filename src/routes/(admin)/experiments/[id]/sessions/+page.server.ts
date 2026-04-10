import { error, fail } from '@sveltejs/kit';
import { getExperimentById } from '$lib/server/experiments';
import {
	cancelSession,
	createOneOffSession,
	deleteSession,
	sessionsWithCounts
} from '$lib/server/sessions';
import { sessionFormSchema } from '$lib/schemas/session';
import { parseForm } from '$lib/server/validate';
import { formatInTz, localToUtc } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const upcomingOnly = url.searchParams.get('all') !== '1';
	const raw = await sessionsWithCounts(experiment.id, { upcomingOnly });
	// Format dates server-side — time.ts pulls from $env/dynamic/private so it
	// can't be imported in client code.
	const sessions = raw.map((s) => ({
		...s,
		startsAtLabel: formatInTz(s.startsAt),
		endsAtLabel: formatInTz(s.endsAt, undefined, { timeStyle: 'short' })
	}));
	return { experiment, sessions, upcomingOnly };
};

export const actions: Actions = {
	create: async ({ request, params }) => {
		const formData = await request.formData();
		const parsed = parseForm(sessionFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		const startsAt = localToUtc(parsed.data.startsAtLocal);
		const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);

		await createOneOffSession(params.id, {
			startsAt,
			endsAt,
			capacity: parsed.data.capacity,
			minParticipants: parsed.data.minParticipants,
			location: parsed.data.location,
			notes: parsed.data.notes
		});
		return { created: true };
	},

	cancel: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing session id' });
		await cancelSession(id);
		return { cancelled: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing session id' });
		await deleteSession(id);
		return { deleted: true };
	}
};
