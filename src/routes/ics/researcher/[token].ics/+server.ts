import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { experiments } from '$lib/server/db/schema';
import { buildResearcherFeed } from '$lib/server/ics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, url }) => {
	const [exp] = await db
		.select()
		.from(experiments)
		.where(eq(experiments.researcherIcsToken, params.token))
		.limit(1);
	if (!exp) throw error(404, 'Feed not found');

	const body = await buildResearcherFeed(exp.id, { host: url.host });
	return new Response(body, {
		headers: {
			'content-type': 'text/calendar; charset=utf-8',
			'cache-control': 'private, max-age=60'
		}
	});
};
