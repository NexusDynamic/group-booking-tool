/**
 * Tiny in-memory token-bucket rate limiter. Keyed by IP. Not clustered — good
 * enough for a single-node self-hosted tool. Resets on process restart.
 *
 * A bucket starts full and drains 1 token per request; it refills at a
 * configured steady rate. Empty bucket → 429.
 *
 * Defaults are deliberately lenient for interactive form submission. If the
 * researcher hosts this in a noisy environment they can tighten via env.
 */
interface Bucket {
	tokens: number;
	lastRefill: number;
	/** Timestamp at which the bucket is full again and can be forgotten. */
	fullAt: number;
}

const buckets = new Map<string, Bucket>();

/** Sweep refilled buckets once the map grows past this many keys. */
const SWEEP_THRESHOLD = 5000;

export interface RateLimitOpts {
	/** Max tokens the bucket can hold — also the max burst size. */
	capacity: number;
	/** Refill rate in tokens per second. */
	refillPerSec: number;
}

const DEFAULT: RateLimitOpts = { capacity: 10, refillPerSec: 1 };

/** Stricter bucket for credential checks: 5 attempts, then one per 30s. */
export const LOGIN_LIMIT: RateLimitOpts = { capacity: 5, refillPerSec: 1 / 30 };

/**
 * Consume one token for `key`. Returns `true` if allowed, `false` if the
 * bucket is empty (caller should 429).
 */
export function rateLimit(key: string, opts: RateLimitOpts = DEFAULT): boolean {
	const now = Date.now();
	let bucket = buckets.get(key);
	if (!bucket) {
		// A fully refilled bucket is indistinguishable from a missing one, so
		// dropping those keeps memory bounded under a flood of distinct keys.
		if (buckets.size >= SWEEP_THRESHOLD) {
			for (const [k, b] of buckets) {
				if (b.fullAt <= now) buckets.delete(k);
			}
		}
		bucket = { tokens: opts.capacity, lastRefill: now, fullAt: now };
		buckets.set(key, bucket);
	}
	// Refill based on elapsed time.
	const elapsedSec = (now - bucket.lastRefill) / 1000;
	const refill = elapsedSec * opts.refillPerSec;
	bucket.tokens = Math.min(opts.capacity, bucket.tokens + refill);
	bucket.lastRefill = now;
	const allowed = bucket.tokens >= 1;
	if (allowed) bucket.tokens -= 1;
	bucket.fullAt = now + ((opts.capacity - bucket.tokens) / opts.refillPerSec) * 1000;
	return allowed;
}

/** Test / admin helper — drop all buckets. */
export function _resetRateLimitBuckets() {
	buckets.clear();
}
