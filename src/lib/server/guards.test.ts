import { describe, expect, it } from 'vitest';
import { clientIp, isAdminRoute, isPublicBookingRoute } from './guards';

describe('route guards', () => {
	it('treats every (admin) route as protected', () => {
		expect(isAdminRoute('/(admin)/dashboard')).toBe(true);
		expect(isAdminRoute('/(admin)/experiments/[id]/sessions/[sessionId]')).toBe(true);
	});

	it('does not protect public routes or unmatched requests', () => {
		expect(isAdminRoute('/login')).toBe(false);
		expect(isAdminRoute('/e/[slug]/sessions')).toBe(false);
		expect(isAdminRoute('/(administrator)/x')).toBe(false);
		expect(isAdminRoute(null)).toBe(false);
	});

	it('classifies public booking routes', () => {
		expect(isPublicBookingRoute('/e/[slug]/sessions')).toBe(true);
		expect(isPublicBookingRoute('/experiments')).toBe(false);
	});
});

describe('clientIp', () => {
	const socket = () => '10.0.0.1';
	const headers = new Headers({
		'x-forwarded-for': '6.6.6.6, 203.0.113.9',
		'cf-connecting-ip': '198.51.100.7'
	});

	it('ignores forwarding headers when no proxy is trusted', () => {
		expect(clientIp(headers, '', socket)).toBe('10.0.0.1');
	});

	it('uses the proxy-appended (right-most) X-Forwarded-For value', () => {
		expect(clientIp(headers, 'proxy', socket)).toBe('203.0.113.9');
	});

	it('prefers CF-Connecting-IP behind Cloudflare', () => {
		expect(clientIp(headers, 'cloudflare', socket)).toBe('198.51.100.7');
	});

	it('falls back to the socket address when the header is missing', () => {
		expect(clientIp(new Headers(), 'proxy', socket)).toBe('10.0.0.1');
	});
});

describe('rateLimit', async () => {
	const { LOGIN_LIMIT, rateLimit, _resetRateLimitBuckets } = await import('./rate-limit');

	it('blocks once the login bucket is drained, per key', () => {
		_resetRateLimitBuckets();
		for (let i = 0; i < LOGIN_LIMIT.capacity; i++) {
			expect(rateLimit('login:1.1.1.1', LOGIN_LIMIT)).toBe(true);
		}
		expect(rateLimit('login:1.1.1.1', LOGIN_LIMIT)).toBe(false);
		expect(rateLimit('login:2.2.2.2', LOGIN_LIMIT)).toBe(true);
	});
});
