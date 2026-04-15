import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { resolve } from '$app/paths';

export const load: LayoutServerLoad = ({ locals, url }) => {
	if (!locals.user) {
		const next = encodeURIComponent(url.pathname + url.search);
		throw redirect(303, resolve(`/login?next=${next}`));
	}
	return { user: locals.user };
};
