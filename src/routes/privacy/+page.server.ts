import {
	DATA_CONTROLLER_NAME,
	DATA_CONTROLLER_EMAIL,
	ADMIN_EMAIL,
	DATA_RETENTION_DAYS
} from '$app/env/private';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = () => ({
	controllerName: DATA_CONTROLLER_NAME ?? '',
	controllerEmail: DATA_CONTROLLER_EMAIL || ADMIN_EMAIL || '',
	retentionDays: DATA_RETENTION_DAYS
});
