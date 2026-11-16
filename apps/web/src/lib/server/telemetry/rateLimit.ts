/** Tiny in-memory token bucket per key (client IP). Good enough for one node. */
type Bucket = { tokens: number; at: number };

const buckets = new Map<string, Bucket>();

export function allow(key: string, perMinute: number): boolean {
	const now = Date.now();
	const b = buckets.get(key) ?? { tokens: perMinute, at: now };
	b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60_000) * perMinute);
	b.at = now;
	if (b.tokens < 1) {
		buckets.set(key, b);
		return false;
	}
	b.tokens -= 1;
	buckets.set(key, b);
	if (buckets.size > 10_000) {
		for (const [k, v] of buckets) if (now - v.at > 120_000) buckets.delete(k);
	}
	return true;
}
