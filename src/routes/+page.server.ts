import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { resolve } from '$app/paths';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) throw redirect(303, resolve('/dashboard'));
	throw redirect(303, resolve('/login'));
};
