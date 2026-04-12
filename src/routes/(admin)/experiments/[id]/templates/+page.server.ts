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
import { CLINIC_TZ, formatInTz, localToUtc } from '$lib/server/time';
import { recurrenceTemplateFormSchema } from '$lib/schemas/session';
import { parseForm } from '$lib/server/validate';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const raw = await listTemplates(experiment.id);
	// Format window dates in clinic timezone server-side (avoids UTC off-by-one in the component)
	const templates = raw.map((t) => ({
		...t,
		windowStartLabel: t.windowStart
			? formatInTz(t.windowStart, undefined, { dateStyle: 'medium' })
			: null,
		windowEndLabel: t.windowEnd ? formatInTz(t.windowEnd, undefined, { dateStyle: 'medium' }) : null
	}));
	return { experiment, templates };
};

/** Midnight on the given local date = start of window (inclusive). */
function windowStartToUtc(dateStr: string | undefined): Date | null {
	if (!dateStr) return null;
	return localToUtc(`${dateStr}T00:00`);
}

/**
 * End-of-day on the given local date = end of window (inclusive).
 * Using T00:00 would exclude sessions on the end date itself because a 09:00
 * session in UTC+2 lands at 07:00 UTC, which is after midnight UTC (22:00 the
 * previous evening local → same effect).
 */
function windowEndToUtc(dateStr: string | undefined): Date | null {
	if (!dateStr) return null;
	return localToUtc(`${dateStr}T23:59:59`);
}

/** Today's date (YYYY-MM-DD) in the clinic timezone. */
function todayInClinicTz(): string {
	// en-CA uses YYYY-MM-DD format
	return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TZ }).format(new Date());
}

export const actions: Actions = {
	create: async ({ request, params }) => {
		const formData = await request.formData();
		const parsed = parseForm(recurrenceTemplateFormSchema, formData);
		if (!parsed.ok) return parsed.failure;

		const {
			label,
			byDay,
			timeLocal,
			durationMinutes,
			capacity,
			minParticipants,
			windowStart,
			windowEnd
		} = parsed.data;

		// Derive dtstartLocal: the RRULE wall-clock anchor. Only the HH:mm part
		// matters for weekly recurrences (BYDAY overrides the day-of-week); we
		// pair it with the window-start date (or today) so the anchor is sensible.
		const anchorDate = windowStart ?? todayInClinicTz();
		const dtstartLocal = `${anchorDate}T${timeLocal}`;

		await createTemplate({
			experimentId: params.id,
			label,
			rrule: buildWeeklyRRule(byDay),
			dtstartLocal,
			durationMinutes,
			capacity,
			minParticipants,
			windowStart: windowStartToUtc(windowStart),
			windowEnd: windowEndToUtc(windowEnd)
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
