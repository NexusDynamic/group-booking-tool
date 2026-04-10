import { error } from '@sveltejs/kit';
import { getExperimentBySlug } from '$lib/server/experiments';
import { getSessionById } from '$lib/server/sessions';
import { cancelBookingByToken, findBookingByToken } from '$lib/server/bookings';
import { formatInTz } from '$lib/server/time';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const experiment = await getExperimentBySlug(params.slug);
	if (!experiment) throw error(404, 'Experiment not found');

	const booking = await findBookingByToken(params.token);
	if (!booking) throw error(404, 'This booking link is not valid');

	const session = await getSessionById(booking.sessionId);
	if (!session || session.experimentId !== experiment.id) {
		throw error(404, 'This booking link is not valid');
	}

	return {
		experiment: {
			slug: experiment.slug,
			name: experiment.name
		},
		booking: {
			id: booking.id,
			status: booking.status,
			snapshotName: booking.snapshotName,
			snapshotEmail: booking.snapshotEmail
		},
		session: {
			startsAtLabel: formatInTz(session.startsAt),
			endsAtLabel: formatInTz(session.endsAt, undefined, { timeStyle: 'short' }),
			location: session.location,
			status: session.status
		}
	};
};

export const actions: Actions = {
	cancel: async ({ params }) => {
		await cancelBookingByToken(params.token);
		return { cancelled: true };
	}
};
