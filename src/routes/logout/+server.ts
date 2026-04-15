import { redirect } from '@sveltejs/kit';
import { resolve } from '$app/paths';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	await auth.api.signOut({ headers: request.headers });
	throw redirect(303, resolve('/login'));
};
