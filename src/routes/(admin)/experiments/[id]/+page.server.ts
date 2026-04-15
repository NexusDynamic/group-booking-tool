import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import {
	deleteExperiment,
	ExperimentHasBookingsError,
	getExperimentById,
	setPublished,
	SlugInUseError,
	updateExperiment
} from '$lib/server/experiments';
import { experimentFormSchema, parseRequiredFields } from '$lib/schemas/experiment';
import { parseForm } from '$lib/server/validate';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	return {
		experiment,
		requiredFields: parseRequiredFields(experiment.requiredFields),
		defaultRetentionDays: Number(env.DATA_RETENTION_DAYS ?? 90)
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const formData = await request.formData();
		const parsed = parseForm(experimentFormSchema, formData);
		if (!parsed.ok) return parsed.failure;
		try {
			await updateExperiment(params.id, parsed.data);
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
		return { saved: true };
	},

	publish: async ({ params }) => {
		await setPublished(params.id, true);
		return { published: true };
	},

	unpublish: async ({ params }) => {
		await setPublished(params.id, false);
		return { published: false };
	},

	delete: async ({ params }) => {
		try {
			await deleteExperiment(params.id);
		} catch (err) {
			if (err instanceof ExperimentHasBookingsError) {
				return fail(400, { deleteError: err.message });
			}
			throw err;
		}
		throw redirect(303, resolve('/experiments'));
	}
};
