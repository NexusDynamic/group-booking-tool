import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { sessions } from '$lib/server/db/schema';
import { buildSessionFeed } from '$lib/server/ics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.publicIcsToken, params.token))
		.limit(1);
	if (!session) throw error(404, 'Feed not found');

	const body = await buildSessionFeed(session.id, { host: url.host });
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'cache-control': 'private, max-age=60'
		}
	});
};
