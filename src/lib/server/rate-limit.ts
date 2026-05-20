type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 5 * 60_000;
const MAX_LOGIN_ATTEMPTS_PER_WINDOW = 10;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_WINDOW = 30;

// key -> bucket
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

	const cur = buckets.get(`login:${ip}`);
	if (!cur || now > cur.resetAt) {
		buckets.set(`login:${ip}`, { count: 1, resetAt: now + WINDOW_MS });
		return { ok: true };
	}

	if (cur.count >= MAX_LOGIN_ATTEMPTS_PER_WINDOW) {
		const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
		return { ok: false, retryAfterSec };
	}

	cur.count += 1;
	return { ok: true };
}

/**
 * Rate limit genérico por IP y "acción" (ej. admin writes).
 * Útil para endpoints sensibles: listas, bloqueos, exportaciones.
 */
export function rateLimitKey(
	action: string,
	ip: string,
	opts?: { windowMs?: number; maxPerWindow?: number }
): { ok: true } | { ok: false; retryAfterSec: number } {
	const now = Date.now();
	pruneStale(now);
	const windowMs = Math.max(5_000, Math.floor(opts?.windowMs ?? DEFAULT_WINDOW_MS));
	const max = Math.max(3, Math.floor(opts?.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW));
	const key = `${action}:${ip}`;

	const cur = buckets.get(key);
	if (!cur || now > cur.resetAt) {
		buckets.set(key, { count: 1, resetAt: now + windowMs });
		return { ok: true };
	}

	if (cur.count >= max) {
		const retryAfterSec = Math.max(1, Math.ceil((cur.resetAt - now) / 1000));
		return { ok: false, retryAfterSec };
	}

	cur.count += 1;
	return { ok: true };
}

/**
 * Lockout por credenciales fallidas. Recomendado usar Redis; si no hay Redis,
 * caemos a memoria (no persistente).
 */
export async function lockoutCheck(
	key: string,
	opts?: { windowMs?: number; maxAttempts?: number; lockoutSec?: number }
): Promise<{ ok: true } | { ok: false; retryAfterSec: number }> {
	const windowMs = Math.max(10_000, Math.floor(opts?.windowMs ?? 10 * 60_000));
	const maxAttempts = Math.max(3, Math.floor(opts?.maxAttempts ?? 8));
	const lockoutSec = Math.max(30, Math.floor(opts?.lockoutSec ?? 10 * 60));

	// Try Redis first
	const { getRedis } = await import('$lib/server/redis');
	const redis = await getRedis();
	if (redis) {
		const now = Date.now();
		const lockKey = `lock:${key}`;
		const locked = await redis.ttl(lockKey);
		if (locked && locked > 0) return { ok: false, retryAfterSec: locked };

		const countKey = `fail:${key}`;
		const count = await redis.incr(countKey);
		if (count === 1) await redis.pexpire(countKey, windowMs);
		if (count >= maxAttempts) {
			await redis.set(lockKey, '1', { EX: lockoutSec });
			return { ok: false, retryAfterSec: lockoutSec };
		}
		return { ok: true };
	}

	// Fallback: memoria
	const rl = rateLimitKey(`lockout:${key}`, key, { windowMs, maxPerWindow: maxAttempts });
	if (!rl.ok) return { ok: false, retryAfterSec: Math.max(60, rl.retryAfterSec) };
	return { ok: true };
}
