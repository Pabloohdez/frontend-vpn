import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { alignHourEpoch } from '$lib/server/dns-timeseries';

export type DnsHourBucket = {
	/** Inicio del bucket horario (epoch s, alineado). */
	t: number;
	total: number;
	allowed: number;
	blocked: number;
};

type Store = { version: 1; hours: DnsHourBucket[] };

function storePath() {
	return (env.DNS_HOURLY_HISTORY_PATH ?? '').trim() || path.join(process.cwd(), 'data', 'dns-hourly-history.json');
}

function retentionDays(): number {
	const n = Number(env.DNS_HISTORY_RETENTION_DAYS ?? 120);
	return Number.isFinite(n) ? Math.max(7, Math.floor(n)) : 120;
}

function readStore(): Store {
	const p = storePath();
	try {
		if (!fs.existsSync(p)) return { version: 1, hours: [] };
		const j = JSON.parse(fs.readFileSync(p, 'utf8')) as Store;
		if (!j || j.version !== 1 || !Array.isArray(j.hours)) return { version: 1, hours: [] };
		return j;
	} catch {
		return { version: 1, hours: [] };
	}
}

function writeStore(store: Store) {
	const p = storePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const tmp = `${p}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
	fs.renameSync(tmp, p);
}

function prune(store: Store): Store {
	const cutoff = alignHourEpoch(Math.floor(Date.now() / 1000)) - retentionDays() * 86400;
	store.hours = store.hours
		.filter((h) => h.t >= cutoff)
		.sort((a, b) => a.t - b.t);
	return store;
}

export function listDnsHourlyBuckets(): DnsHourBucket[] {
	return prune(readStore()).hours;
}

export function hasDnsHourBucket(t: number): boolean {
	const store = readStore();
	return store.hours.some((h) => h.t === t);
}

export function upsertDnsHourBucket(bucket: DnsHourBucket) {
	const store = readStore();
	const idx = store.hours.findIndex((h) => h.t === bucket.t);
	if (idx >= 0) store.hours[idx] = bucket;
	else {
		store.hours.push(bucket);
		store.hours.sort((a, b) => a.t - b.t);
	}
	writeStore(prune(store));
}

export function countDnsHourlyBuckets(): number {
	return readStore().hours.length;
}

/** Horas completas ya cerradas que faltan en el histórico (más recientes primero, límite). */
export function missingHourStarts(upToEpoch: number, limit = 48): number[] {
	const store = readStore();
	const have = new Set(store.hours.map((h) => h.t));
	const out: number[] = [];
	const end = alignHourEpoch(upToEpoch);
	for (let t = end - 3600; t >= end - retentionDays() * 86400 && out.length < limit; t -= 3600) {
		if (!have.has(t)) out.push(t);
	}
	return out;
}
