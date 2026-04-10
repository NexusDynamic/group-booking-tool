import { createHash, randomBytes } from 'node:crypto';

/**
 * Opaque self-manage tokens used by public booking / preference URLs.
 *
 * Security model:
 *   - `generateToken()` returns a 256-bit random base64url string (~43 chars).
 *     It is transmitted to the participant ONCE (in the form action response)
 *     and lives only in the URL path thereafter.
 *   - The database only ever stores `hashToken(raw)`. Lookups hash the URL
 *     segment and do a single indexed SELECT on `manage_token_hash`.
 *   - There is no way to recover a lost token — participants are told to
 *     bookmark the confirmation page.
 */

/** Generate a fresh 256-bit base64url token. */
export function generateToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Hash a raw token for DB storage / lookup. Returns lowercase hex. */
export function hashToken(raw: string): string {
	return createHash('sha256').update(raw).digest('hex');
}
