/**
 * Vitest setup for the server project: every server test runs against an
 * in-memory database and a fixed clinic timezone / locale.
 */
import { vi } from 'vitest';

vi.mock('$app/env/private', async (importOriginal) => ({
	...(await importOriginal()),
	DATABASE_URL: ':memory:',
	CLINIC_TZ: 'Europe/Copenhagen',
	CLINIC_LOCALE: 'da-DK'
}));
