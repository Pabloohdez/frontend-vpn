type Entry = { at: number; body: unknown };

const store = new Map<string, Entry>();

export function getCachedJson<T>(key: string, ttlMs: number): T | null {
	const e = store.get(key);
	if (!e) return null;
	if (Date.now() - e.at > ttlMs) {
		store.delete(key);
		return null;
	}
	return e.body as T;
}

export function setCachedJson(key: string, body: unknown) {
	store.set(key, { at: Date.now(), body });
}

export function cacheTtlMs(envKey: string, defaultSec: number): number {
	const n = Number(process.env[envKey] ?? defaultSec);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) * 1000 : defaultSec * 1000;
}
