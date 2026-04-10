import { fail, redirect } from '@sveltejs/kit';
import {
	createExperiment,
	listExperiments,
	SlugInUseError
} from '$lib/server/experiments';
import { experimentFormSchema } from '$lib/schemas/experiment';
import { slugify } from '$lib/server/slug';
import { parseForm } from '$lib/server/validate';
import type { Actions, PageServerLoad } from './$types';

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
			throw redirect(303, `/experiments/${exp.id}`);
		} catch (err) {
			if (err instanceof SlugInUseError) {
				const errors: Record<string, string> = { slug: err.message };
				const values: Record<string, string> = {};
				for (const [k, v] of formData.entries()) {
					if (typeof v === 'string') values[k] = v;
				}
				return fail(400, { errors, values });
			}
			throw err;
		}
	}
};
