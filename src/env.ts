import { defineEnvVars } from '@sveltejs/kit/env';

// Optional variables resolve to '' when unset, so callers can use `||` fallbacks.
const optional = (input: string | undefined) => input ?? '';

export const variables = defineEnvVars({
	TRUSTED_PROXY: { schema: optional },
	DATA_CONTROLLER_NAME: { schema: optional },
	DATA_CONTROLLER_EMAIL: { schema: optional },
	ADMIN_EMAIL: { schema: optional },
	DATA_RETENTION_DAYS: {
		schema: (input) => {
			if (!input) return 90;
			const days = Number(input);
			if (!Number.isInteger(days) || days <= 0) {
				throw new Error(`DATA_RETENTION_DAYS must be a positive integer, got: ${input}`);
			}
			return days;
		}
	},
	// Left undefined when unset so better-auth applies its own fallbacks.
	ORIGIN: { schema: (input) => input || undefined },
	BETTER_AUTH_SECRET: { schema: (input) => input || undefined },
	LOG_FILE: { schema: optional },
	CLINIC_TZ: { schema: optional },
	CLINIC_LOCALE: { schema: optional },
	DATABASE_URL: { schema: optional }
});
