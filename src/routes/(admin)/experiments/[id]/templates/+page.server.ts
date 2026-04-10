import { error, fail } from '@sveltejs/kit';
import { getExperimentById } from '$lib/server/experiments';
import {
	createTemplate,
	deleteTemplate,
	listTemplates,
	materialiseTemplate,
	regenerateFutureSessions
} from '$lib/server/sessions';
import { buildWeeklyRRule } from '$lib/server/recurrence';
import { localToUtc } from '$lib/server/time';
import { recurrenceTemplateFormSchema } from '$lib/schemas/session';
import { parseForm } from '$lib/server/validate';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const templates = await listTemplates(experiment.id);
	return { experiment, templates };
};

function dateOnlyToUtc(dateStr: string | undefined): Date | null {
	if (!dateStr) return null;
	return localToUtc(`${dateStr}T00:00`);
}

export const actions: Actions = {
	create: async ({ request, params }) => {
		const formData = await request.formData();
		const parsed = parseForm(recurrenceTemplateFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		const { label, byDay, dtstartLocal, durationMinutes, capacity, minParticipants, windowStart, windowEnd } =
			parsed.data;

		await createTemplate({
			experimentId: params.id,
			label,
			rrule: buildWeeklyRRule(byDay),
			dtstartLocal,
			durationMinutes,
			capacity,
			minParticipants,
			windowStart: dateOnlyToUtc(windowStart),
			windowEnd: dateOnlyToUtc(windowEnd)
		});

		return { created: true };
	},

	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { deleteError: 'Missing template id' });
		await deleteTemplate(id);
		return { deleted: true };
	},

	generate: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { generateError: 'Missing template id' });
		const inserted = await materialiseTemplate(id);
		return { generated: true, inserted };
	},

	regenerate: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { generateError: 'Missing template id' });
		const result = await regenerateFutureSessions(id);
		return { regenerated: true, ...result };
	}
};
