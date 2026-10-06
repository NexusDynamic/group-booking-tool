/**
 * Route classification used by `hooks.server.ts`. Matching on the route id
 * (rather than the raw pathname) keeps the checks correct when the app is
 * served under a `BASE_URL` prefix.
 */

/** Everything under `src/routes/(admin)` requires a signed-in researcher. */
export function isAdminRoute(routeId: string | null): boolean {
	return routeId === '/(admin)' || (routeId?.startsWith('/(admin)/') ?? false);
}

/** Public participant-facing booking routes. */
export function isPublicBookingRoute(routeId: string | null): boolean {
	return routeId?.startsWith('/e/') ?? false;
}

/**
 * Resolve the client IP used as the rate-limit key.
 *
 * Forwarding headers are only honoured when `trustedProxy` says a proxy we
 * control sets them — otherwise a client could rotate the key at will:
 *
 * - `cloudflare`: CF-Connecting-IP, which Cloudflare controls.
 * - `proxy`: the right-most X-Forwarded-For value, i.e. the one appended by
 *   the nearest reverse proxy (nginx `$proxy_add_x_forwarded_for`). Values
 *   further left are client-supplied and ignored.
 * - anything else: the socket address.
 */
export function clientIp(
	headers: Headers,
	trustedProxy: string,
	socketAddress: () => string
): string {
	if (trustedProxy === 'cloudflare') {
		const ip = headers.get('cf-connecting-ip')?.trim();
		if (ip) return ip;
	}
	if (trustedProxy === 'cloudflare' || trustedProxy === 'proxy') {
		const ip = headers.get('x-forwarded-for')?.split(',').at(-1)?.trim();
		if (ip) return ip;
	}
	return socketAddress();
}
