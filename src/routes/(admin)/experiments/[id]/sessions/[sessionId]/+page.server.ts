import { error, fail, redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { getExperimentById } from '#lib/server/experiments.js';
import {
	cancelSession,
	deleteSession,
	getSessionById,
	updateSession
} from '#lib/server/sessions.js';
import { listBookingsForSession, setBookingStatus } from '#lib/server/bookings.js';
import { sessionFormSchema } from '#lib/schemas/session.js';
import { CLINIC_TZ, formatInTz, localToUtc } from '#lib/server/time.js';
import { formId, parseForm } from '#lib/server/validate.js';
import type { Actions, PageServerLoad } from './$types';

/** Format a UTC Date as "YYYY-MM-DDTHH:mm" in CLINIC_TZ for datetime-local inputs. */
function toClinicTzInput(d: Date): string {
	const dtf = new Intl.DateTimeFormat('en-CA', {
		timeZone: CLINIC_TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	});
	const parts = Object.fromEntries(dtf.formatToParts(d).map((p) => [p.type, p.value]));
	const h = +parts.hour === 24 ? '00' : parts.hour;
	return `${parts.year}-${parts.month}-${parts.day}T${h}:${parts.minute}`;
}

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentById(params.id);
	if (!experiment) throw error(404, 'Experiment not found');
	const session = await getSessionById(params.sessionId);
	if (!session || session.experimentId !== experiment.id) {
		throw error(404, 'Session not found');
	}
	const rawBookings = await listBookingsForSession(session.id);
	const bookings = rawBookings.map((b) => ({
		id: b.id,
		snapshotName: b.snapshotName,
		snapshotEmail: b.snapshotEmail,
		status: b.status
	}));
	return {
		experiment,
		session: {
			...session,
			startsAtLabel: formatInTz(session.startsAt),
			endsAtLabel: formatInTz(session.endsAt),
			startsAtInput: toClinicTzInput(session.startsAt)
		},
		bookings,
		clinicTz: CLINIC_TZ
	};
};

const attendanceAction =
	(status: 'attended' | 'no_show' | 'confirmed'): Actions[string] =>
	async ({ request, params }) => {
		const id = formId(await request.formData(), 'bookingId');
		if (!id) return fail(400, { error: 'Missing booking id' });
		// Scoped to this session, so a booking id from elsewhere is rejected.
		if (!(await setBookingStatus(id, params.sessionId, status))) {
			return fail(404, { error: 'Booking not found' });
		}
		return { attendanceSet: true };
	};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const parsed = parseForm(sessionFormSchema, await request.formData());
		if (!parsed.ok) return parsed.failure;

		const startsAt = localToUtc(parsed.data.startsAtLocal);
		const endsAt = new Date(startsAt.getTime() + parsed.data.durationMinutes * 60 * 1000);
		const updated = await updateSession(params.sessionId, params.id, {
			startsAt,
			endsAt,
			capacity: parsed.data.capacity,
			minParticipants: parsed.data.minParticipants,
			location: parsed.data.location,
			notes: parsed.data.notes
		});
		if (!updated) throw error(404, 'Session not found');
		return { saved: true, values: parsed.values };
	},

	cancel: async ({ params }) => {
		await cancelSession(params.sessionId, params.id);
		return { cancelled: true };
	},

	delete: async ({ params }) => {
		await deleteSession(params.sessionId, params.id);
		throw redirect(303, resolve(`experiments/${params.id}/sessions`));
	},

	markAttended: attendanceAction('attended'),
	markNoShow: attendanceAction('no_show'),
	unmarkAttendance: attendanceAction('confirmed')
};
