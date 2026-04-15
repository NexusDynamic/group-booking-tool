import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { buildPrivacyNotice, getExperimentBySlug } from '$lib/server/experiments';
import { sessionsWithCounts } from '$lib/server/sessions';
import { sessionListPreferenceFormSchema } from '$lib/schemas/preference';
import { bookingSchemaFor } from '$lib/schemas/booking';
import { parseRequiredFields } from '$lib/schemas/experiment';
import { createSessionListPreference } from '$lib/server/preferences';
import { parseForm } from '$lib/server/validate';
import { formatInTz } from '$lib/server/time';
import { env } from '$env/dynamic/private';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');
	const raw = await sessionsWithCounts(experiment.id, { upcomingOnly: true });
	const sessions = raw
		.filter((s) => s.status === 'scheduled')
		.map((s) => ({
			id: s.id,
			startsAtLabel: formatInTz(s.startsAt),
			endsAtLabel: formatInTz(s.endsAt, undefined, { timeStyle: 'short' }),
			confirmedCount: s.confirmedCount,
			capacity: s.capacity,
			isFull: s.confirmedCount >= s.capacity
		}));
	return {
		experiment: { id: experiment.id, slug: experiment.slug, name: experiment.name },
		sessions,
		requiredFields: parseRequiredFields(experiment.requiredFields),
		privacyNotice: buildPrivacyNotice(experiment, Number(env.DATA_RETENTION_DAYS ?? 90))
	};
};

export const actions: Actions = {
	submit: async ({ request, params }) => {
		const experiment = await getExperimentBySlug(params.slug);
		if (!experiment || !experiment.isPublished) throw error(404, 'Experiment not found');

		const formData = await request.formData();
		// Collect all `sessionIds` values (repeated checkbox name) and fold
		// into a single CSV for the schema.
		const ids = formData.getAll('sessionIds').filter((v) => typeof v === 'string') as string[];
		formData.set('sessionIds', ids.join(','));

		const requiredFields = parseRequiredFields(experiment.requiredFields);

		// Collect form values once; parse standard fields then custom fields.
		const values: Record<string, string> = {};
		for (const [k, v] of formData.entries()) {
			if (typeof v === 'string') values[k] = v;
		}

		const parsed = parseForm(sessionListPreferenceFormSchema, formData);
		if (!parsed.ok) return parsed.failure;
		if (parsed.data.honeypot) return fail(400, { error: 'Submission rejected.' });

		// Privacy notice acknowledgement — required.
		if (values.consent !== 'on') {
			const errors: Record<string, string> = {
				consent: 'You must acknowledge the privacy notice to continue.'
			};
			return fail(400, { errors, values });
		}

		// Validate custom fields using the same dynamic schema as the direct booking form.
		const extraSchema = bookingSchemaFor(requiredFields);
		const extraResult = extraSchema.safeParse(values);
		if (!extraResult.success) {
			const errors: Record<string, string> = {};
			for (const issue of extraResult.error.issues) {
				const path = issue.path.join('.') || '_';
				if (!errors[path]) errors[path] = issue.message;
			}
			return fail(400, { errors, values });
		}

		const snapshotFields: Record<string, unknown> = {};
		for (const f of requiredFields) {
			const key = `field_${f.key}`;
			if (key in extraResult.data)
				snapshotFields[f.key] = (extraResult.data as Record<string, unknown>)[key];
		}

		const { rawToken } = await createSessionListPreference({
			experimentId: experiment.id,
			name: parsed.data.name,
			email: parsed.data.email,
			sessionIds: parsed.data.sessionIds.split(',').filter(Boolean),
			notes: parsed.data.notes,
			snapshotFields
		});

		throw redirect(303, resolve(`/e/${experiment.slug}/preference/${rawToken}`));
	}
};
