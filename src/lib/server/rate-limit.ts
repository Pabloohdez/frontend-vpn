type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 5 * 60_000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;

const buckets = new Map<string, Bucket>();

function pruneStale(now: number) {
	if (buckets.size < 500) return;
	for (const [ip, b] of buckets) {
		if (now > b.resetAt + WINDOW_MS) buckets.delete(ip);
	}
}

/** Limita intentos de login por IP (ventana deslizante). */
export function rateLimitLogin(ip: string): { ok: true } | { ok: false; retryAfterSec: number } {
	const now = Date.now();
	pruneStale(now);

	const cur = buckets.get(ip);
	if (!cur || now > cur.resetAt) {
		buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
		return { ok: true };
	}

	if (cur.count >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
		const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
		return { ok: false, retryAfterSec };
	}

	cur.count += 1;
	return { ok: true };
}
