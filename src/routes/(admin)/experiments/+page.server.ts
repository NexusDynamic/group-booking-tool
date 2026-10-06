import { fail, redirect } from '@sveltejs/kit';
import { createExperiment, listExperiments, SlugInUseError } from '#lib/server/experiments.js';
import { experimentFormSchema } from '#lib/schemas/experiment.js';
import { slugify } from '#lib/server/slug.js';
import { formValues, parseForm } from '#lib/server/validate.js';
import type { Actions, PageServerLoad } from './$types';
import { resolve } from '$app/paths';

export const load: PageServerLoad = async () => {
	return { experiments: await listExperiments() };
};

export const actions: Actions = {
	create: async ({ request }) => {
		const formData = await request.formData();
		// Auto-slug from name if slug field is blank (nice UX)
		if (!formData.get('slug')) {
			const name = formData.get('name')?.toString() ?? '';
			formData.set('slug', slugify(name));
		}
		const parsed = parseForm(experimentFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		try {
			const exp = await createExperiment(parsed.data);
			throw redirect(303, resolve(`experiments/${exp.id}`));
		} catch (err) {
			if (err instanceof SlugInUseError) {
				const errors: Record<string, string> = { slug: err.message };
				return fail(400, { errors, values: formValues(formData) });
			}
			throw err;
		}
	}
};
