import { error, fail } from '@sveltejs/kit';
import { getExperimentById, updateRequiredFields } from '$lib/server/experiments';
import {
	parseRequiredFields,
	requiredFieldsSchema,
	type RequiredField
} from '$lib/schemas/experiment';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	return {
		experiment,
		fields: parseRequiredFields(experiment.requiredFields)
	};
};

/**
 * Fields are edited in a single form with indexed inputs:
 *   fields[0].key, fields[0].label, fields[0].type, fields[0].required
 * We reconstruct the array from FormData, then validate with zod.
 */
function formDataToFields(fd: FormData): unknown[] {
	const byIndex: Record<string, Record<string, unknown>> = {};
	for (const [key, value] of fd.entries()) {
		const match = key.match(/^fields\[(\d+)\]\.(key|label|type|required)$/);
		if (!match) continue;
		const [, idx, prop] = match;
		if (!byIndex[idx]) byIndex[idx] = {};
		if (prop === 'required') {
			byIndex[idx][prop] = value === 'on' || value === 'true';
		} else {
			byIndex[idx][prop] = value;
		}
	}
	return Object.keys(byIndex)
		.sort((a, b) => Number(a) - Number(b))
		.map((k) => {
			const entry = byIndex[k];
			// Default `required` to false when the checkbox is missing from the form
			if (entry.required === undefined) entry.required = false;
			return entry;
		});
}

export const actions: Actions = {
	save: async ({ request, params }) => {
		const fd = await request.formData();
		const raw = formDataToFields(fd);
		const result = requiredFieldsSchema.safeParse(raw);
		if (!result.success) {
			const errors: Record<string, string> = {};
			for (const issue of result.error.issues) {
				const path = issue.path.join('.');
				if (!errors[path]) errors[path] = issue.message;
			}
			return fail(400, { errors, fields: raw as RequiredField[] });
		}
		// Reject duplicate keys — zod array schema doesn't check cross-item uniqueness
		const keys = result.data.map((f) => f.key);
		if (new Set(keys).size !== keys.length) {
			const errors: Record<string, string> = { _: 'Field keys must be unique' };
			return fail(400, { errors, fields: result.data });
		}
		await updateRequiredFields(params.id, result.data);
		return { saved: true, fields: result.data };
	}
};
