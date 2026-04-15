import { error, fail, redirect } from '@sveltejs/kit';
import { getExperimentById } from '$lib/server/experiments';
import { cancelSession, deleteSession, getSessionById, updateSession } from '$lib/server/sessions';
import { listBookingsForSession, setBookingStatus } from '$lib/server/bookings';
import { formatInTz, localToUtc } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

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
			endsAtLabel: formatInTz(session.endsAt)
		},
		sessionCalendarUrl: `/ics/session/${session.publicIcsToken}.ics`,
		bookings
	};
};

export const actions: Actions = {
	update: async ({ request, params }) => {
		const formData = await request.formData();
		const startsAtLocal = String(formData.get('startsAtLocal') ?? '');
		const durationMinutes = Number(formData.get('durationMinutes') ?? 0);
		const capacity = Number(formData.get('capacity') ?? 0);
		const minParticipants = Number(formData.get('minParticipants') ?? 0);
		const location = String(formData.get('location') ?? '');
		const notes = String(formData.get('notes') ?? '');

		if (!startsAtLocal || !durationMinutes || !capacity || !minParticipants) {
			return fail(400, { error: 'Missing required field' });
		}

		const startsAt = localToUtc(startsAtLocal);
		const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000);
		await updateSession(params.sessionId, {
			startsAt,
			endsAt,
			capacity,
			minParticipants,
			location,
			notes
		});
		return {
			saved: true,
			values: {
				startsAtLocal,
				durationMinutes: String(durationMinutes),
				capacity: String(capacity),
				minParticipants: String(minParticipants),
				location,
				notes
			}
		};
	},

	cancel: async ({ params }) => {
		await cancelSession(params.sessionId);
		return { cancelled: true };
	},

	delete: async ({ params }) => {
		await deleteSession(params.sessionId);
		throw redirect(303, `/experiments/${params.id}/sessions`);
	},

	markAttended: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('bookingId') ?? '');
		if (!id) return fail(400, { error: 'Missing booking id' });
		await setBookingStatus(id, 'attended');
		return { attendanceSet: true };
	},

	markNoShow: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('bookingId') ?? '');
		if (!id) return fail(400, { error: 'Missing booking id' });
		await setBookingStatus(id, 'no_show');
		return { attendanceSet: true };
	},

	unmarkAttendance: async ({ request }) => {
		const formData = await request.formData();
		const id = String(formData.get('bookingId') ?? '');
		if (!id) return fail(400, { error: 'Missing booking id' });
		await setBookingStatus(id, 'confirmed');
		return { attendanceSet: true };
	}
};
