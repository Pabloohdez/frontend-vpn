import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { listCategories, upsertCategoryDomains } from '$lib/server/category-store';

export type ThreatIntelState = {
	lastSyncAt: string | null;
	lastDomainCount: number;
	lastAdded: number;
	lastError: string | null;
	source: string | null;
};

export type UrlhausSyncResult =
	| { ok: true; skipped: false; added: number; total: number; fetched: number; source: string }
	| { ok: true; skipped: true; reason: string }
	| { ok: false; error: string };

function statePath() {
	return (env.THREAT_INTEL_STATE_PATH ?? '').trim() || path.join(process.cwd(), 'data', 'threat-intel.json');
}

function readState(): ThreatIntelState {
	const p = statePath();
	if (!fs.existsSync(p)) {
		return { lastSyncAt: null, lastDomainCount: 0, lastAdded: 0, lastError: null, source: null };
	}
	try {
		const j = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<ThreatIntelState>;
		return {
			lastSyncAt: typeof j.lastSyncAt === 'string' ? j.lastSyncAt : null,
			lastDomainCount: typeof j.lastDomainCount === 'number' ? j.lastDomainCount : 0,
			lastAdded: typeof j.lastAdded === 'number' ? j.lastAdded : 0,
			lastError: typeof j.lastError === 'string' ? j.lastError : null,
			source: typeof j.source === 'string' ? j.source : null
		};
	} catch {
		return { lastSyncAt: null, lastDomainCount: 0, lastAdded: 0, lastError: null, source: null };
	}
}

function writeState(state: ThreatIntelState) {
	const p = statePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function getThreatIntelState(): ThreatIntelState {
	return readState();
}

export function isThreatIntelEnabled(): boolean {
	const v = (env.THREAT_INTEL_ENABLED ?? '').trim().toLowerCase();
	return v === '1' || v === 'true' || v === 'yes';
}

function maxDomains(): number {
	const n = Number(env.THREAT_INTEL_MAX_DOMAINS ?? '3000');
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 3000;
}

function intervalMs(): number {
	const h = Number(env.THREAT_INTEL_INTERVAL_HOURS ?? '12');
	const hours = Number.isFinite(h) && h > 0 ? h : 12;
	return hours * 60 * 60 * 1000;
}

function feedUrl(): string | null {
	const custom = (env.URLHAUS_HOSTFILE_URL ?? '').trim();
	if (custom) return custom;
	const key = (env.URLHAUS_AUTH_KEY ?? '').trim();
	if (!key) return null;
	return `https://urlhaus-api.abuse.ch/v2/hostfile/${encodeURIComponent(key)}/hostfile.txt`;
}

/** Normaliza y valida un nombre de host (FQDN). */
export function normalizeThreatDomain(raw: string): string | null {
	const s = raw.trim().toLowerCase().replace(/\.$/, '');
	if (!s || s.length > 253 || s.includes('/') || s.includes(':')) return null;
	if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/.test(s)) {
		return null;
	}
	return s;
}

function hostFromUrlish(token: string): string | null {
	let t = token.trim();
	if (!t) return null;
	try {
		if (/^https?:\/\//i.test(t)) {
			const u = new URL(t);
			return normalizeThreatDomain(u.hostname);
		}
	} catch {
		/* ignore */
	}
	t = t.replace(/^https?:\/\//i, '').split('/')[0]?.split('?')[0]?.split('#')[0] ?? '';
	return normalizeThreatDomain(t);
}

/** Extrae dominios de hostfile Pi-hole, CSV o lista plana. */
export function parseThreatFeedText(text: string): string[] {
	const out: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const t = line.trim();
		if (!t || t.startsWith('#')) continue;

		if (t.includes(',') && (t.includes('http') || t.toLowerCase().includes('url'))) {
			const m = t.match(/https?:\/\/[^",\s]+/i);
			if (m) {
				const h = hostFromUrlish(m[0]);
				if (h) out.push(h);
			}
			continue;
		}

		const parts = t.split(/\s+/).filter(Boolean);
		if (parts.length >= 2 && /^\d+\.\d+\.\d+\.\d+$/.test(parts[0])) {
			const h = normalizeThreatDomain(parts[parts.length - 1]);
			if (h) out.push(h);
			continue;
		}

		const h = hostFromUrlish(parts[0] ?? t);
		if (h) out.push(h);
	}

	return [...new Set(out)];
}

function mergeIntoMalware(incoming: string[]): { added: number; total: number } {
	const cats = listCategories();
	const malware = cats.find((c) => c.id === 'malware');
	const existing = malware?.domains ?? [];
	const cap = maxDomains();
	const merged = [...new Set([...existing, ...incoming])].slice(0, cap);
	const before = existing.length;
	upsertCategoryDomains('malware', merged);
	return { added: Math.max(0, merged.length - before), total: merged.length };
}

export async function syncUrlhausMalwareDomains(
	fetchFn: typeof fetch,
	opts?: { force?: boolean }
): Promise<UrlhausSyncResult> {
	if (!isThreatIntelEnabled() && !opts?.force) {
		return { ok: true, skipped: true, reason: 'THREAT_INTEL_ENABLED no está activo' };
	}

	const url = feedUrl();
	if (!url) {
		const msg =
			'Configura URLHAUS_AUTH_KEY (cuenta gratuita abuse.ch) o URLHAUS_HOSTFILE_URL en .env';
		writeState({ ...readState(), lastError: msg, lastSyncAt: new Date().toISOString() });
		return { ok: false, error: msg };
	}

	const headers: Record<string, string> = { 'User-Agent': 'fronted-vpn-panel/1.0' };
	const key = (env.URLHAUS_AUTH_KEY ?? '').trim();
	if (key && !url.includes(key)) {
		headers['Auth-Key'] = key;
	}

	let res: Response;
	try {
		res = await fetchFn(url, { headers, signal: AbortSignal.timeout(120_000) });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'Error de red al descargar feed';
		writeState({ ...readState(), lastError: msg, lastSyncAt: new Date().toISOString() });
		return { ok: false, error: msg };
	}

	if (!res.ok) {
		const msg = `URLhaus respondió HTTP ${res.status}`;
		writeState({ ...readState(), lastError: msg, lastSyncAt: new Date().toISOString(), source: url });
		return { ok: false, error: msg };
	}

	const text = await res.text();
	const domains = parseThreatFeedText(text);
	if (!domains.length) {
		const msg = 'El feed no contenía dominios parseables';
		writeState({ ...readState(), lastError: msg, lastSyncAt: new Date().toISOString(), source: url });
		return { ok: false, error: msg };
	}

	const { added, total } = mergeIntoMalware(domains);
	const state: ThreatIntelState = {
		lastSyncAt: new Date().toISOString(),
		lastDomainCount: total,
		lastAdded: added,
		lastError: null,
		source: url
	};
	writeState(state);
	return { ok: true, skipped: false, added, total, fetched: domains.length, source: url };
}

let lastTickMs = 0;

export async function tickThreatIntelSync(fetchFn: typeof fetch, force = false) {
	if (!isThreatIntelEnabled()) return;
	const now = Date.now();
	if (!force && now - lastTickMs < intervalMs()) return;
	lastTickMs = now;
	await syncUrlhausMalwareDomains(fetchFn);
}
