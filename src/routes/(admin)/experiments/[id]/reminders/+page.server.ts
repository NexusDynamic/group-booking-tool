import { error, fail } from '@sveltejs/kit';
import { getExperimentById } from '#lib/server/experiments.js';
import {
	createReminderRule,
	deleteReminderRule,
	listReminderRules
} from '#lib/server/reminders.js';
import { reminderRuleFormSchema } from '#lib/schemas/reminder.js';
import { parseForm } from '#lib/server/validate.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const rules = await listReminderRules(experiment.id);
	return { experiment, rules };
};

export const actions: Actions = {
	create: async ({ request, params }) => {
		const formData = await request.formData();
		const parsed = parseForm(reminderRuleFormSchema, formData);
		if (!parsed.ok) return parsed.failure;
		await createReminderRule({ experimentId: params.id, ...parsed.data });
		return { created: true };
	},
	delete: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('id') ?? '');
		if (!id) return fail(400, { error: 'Missing rule id' });
		await deleteReminderRule(id);
		return { deleted: true };
	}
};
