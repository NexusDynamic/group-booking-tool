import { describe, it, expect } from 'vitest';
import { generateToken, hashToken } from './tokens';

describe('tokens', () => {
	it('generates a 256-bit base64url token (~43 chars, no padding)', () => {
		const t = generateToken();
		expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
		// 32 raw bytes → ceil(32 / 3) * 4 = 44 chars with '=' padding,
		// which base64url strips → 43 chars.
		expect(t.length).toBe(43);
	});

	it('produces distinct tokens across calls', () => {
		const a = generateToken();
		const b = generateToken();
		expect(a).not.toBe(b);
	});

	it('hashToken is deterministic and hex-encoded sha256 (64 chars)', () => {
		const raw = 'abc123';
		const h1 = hashToken(raw);
		const h2 = hashToken(raw);
		expect(h1).toBe(h2);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
	});

	it('hashToken differs for different inputs', () => {
		expect(hashToken('a')).not.toBe(hashToken('b'));
	});
});
