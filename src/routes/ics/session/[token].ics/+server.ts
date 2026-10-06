import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { sessions } from '#lib/server/db/schema.js';
import { buildSessionFeed, icsResponse } from '#lib/server/ics.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const [session] = await db
		.select()
		.from(sessions)
		.where(eq(sessions.publicIcsToken, params.token))
		.limit(1);
	if (!session) throw error(404, 'Feed not found');

	const body = await buildSessionFeed(session.id, { host: url.host });
	return icsResponse(body, 'private');
};
