import { error, fail } from '@sveltejs/kit';
import { getExperimentById } from '#lib/server/experiments.js';
import {
	createTemplate,
	deleteTemplate,
	getTemplateById,
	listTemplates,
	materialiseTemplate,
	regenerateFutureSessions
} from '#lib/server/sessions.js';
import { buildWeeklyRRule } from '#lib/server/recurrence.js';
import { CLINIC_TZ, formatInTz, localToUtc } from '#lib/server/time.js';
import { recurrenceTemplateFormSchema } from '#lib/schemas/session.js';
import { formId, parseForm } from '#lib/server/validate.js';
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
	return { experiment, templates, clinicTz: CLINIC_TZ };
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
			location,
			notes,
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
			location,
			notes,
			windowStart: windowStartToUtc(windowStart),
			windowEnd: windowEndToUtc(windowEnd)
		});

		return { created: true };
	},

	delete: async ({ request, params }) => {
		const id = formId(await request.formData());
		if (!id) return fail(400, { deleteError: 'Missing template id' });
		await deleteTemplate(id, params.id);
		return { deleted: true };
	},

	generate: async ({ request, params }) => {
		const id = formId(await request.formData());
		if (!id || !(await getTemplateById(id, params.id))) {
			return fail(400, { generateError: 'Template not found' });
		}
		const inserted = await materialiseTemplate(id, params.id);
		return { generated: true, inserted };
	},

	regenerate: async ({ request, params }) => {
		const id = formId(await request.formData());
		if (!id || !(await getTemplateById(id, params.id))) {
			return fail(400, { generateError: 'Template not found' });
		}
		const result = await regenerateFutureSessions(id, params.id);
		return { regenerated: true, ...result };
	}
};
