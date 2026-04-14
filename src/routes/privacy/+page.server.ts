import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	controllerName: env.DATA_CONTROLLER_NAME ?? '',
	controllerEmail: env.DATA_CONTROLLER_EMAIL || env.ADMIN_EMAIL || '',
	retentionDays: Number(env.DATA_RETENTION_DAYS ?? 90)
});
