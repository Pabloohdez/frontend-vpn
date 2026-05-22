import { execFile } from 'child_process';
import { promisify } from 'util';
import {
	assertPiholeConfigured,
	piholeApiToken,
	piholeBaseUrl,
	piholeBaseUrlCandidates,
	piholeRootBaseUrl
} from '$lib/server/pihole';
import { piholeV6Login } from '$lib/server/pihole-v6-session';

const execFileAsync = promisify(execFile);

/** Tupla compatible con la UI DNS: [unix_ts, tipo, dominio, cliente, estado]. */
export type PiholeQueryTuple = [number, string, string, string, number];

export { piholeRootBaseUrl } from '$lib/server/pihole';

function asTuple(ts: number, qtype: string, domain: string, client: string, status = 0): PiholeQueryTuple {
	return [ts, qtype, domain, client, status];
}

function parseV6QueryItem(q: unknown): PiholeQueryTuple | null {
	if (!q || typeof q !== 'object') return null;
	const o = q as Record<string, unknown>;
	const t = o.time ?? o.timestamp;
	const ts = typeof t === 'number' ? Math.floor(t) : Math.floor(Number(t));
	if (!Number.isFinite(ts) || ts <= 0) return null;
	const domain = String(o.domain ?? '');
	const qtype = String(o.type ?? '');
	const rawClient = o.client;
	let client = '';
	if (typeof rawClient === 'string') {
		client = rawClient.trim();
	} else if (rawClient && typeof rawClient === 'object') {
		const c = rawClient as Record<string, unknown>;
		const ip = typeof c.ip === 'string' ? c.ip.trim() : '';
		const name = typeof c.name === 'string' ? c.name.trim() : '';
		if (ip && name) client = `${ip} (${name})`;
		else client = ip || name;
	}
	if (!client) {
		const ip = typeof o.client_ip === 'string' ? o.client_ip.trim() : '';
		const name = typeof o.client_name === 'string' ? o.client_name.trim() : '';
		if (ip && name) client = `${ip} (${name})`;
		else client = ip || name;
	}
	let status = 0;
	if (typeof o.status === 'number' && Number.isFinite(o.status)) status = Math.floor(o.status);
	else if (typeof o.status === 'string') status = Math.floor(Number(o.status)) || 0;
	return asTuple(ts, qtype, domain, client, status);
}

function parseLegacyRow(row: unknown): PiholeQueryTuple | null {
	if (!Array.isArray(row) || row.length < 4) return null;
	const ts = Math.floor(Number(row[0]));
	if (!Number.isFinite(ts)) return null;
	return asTuple(ts, String(row[1] ?? ''), String(row[2] ?? ''), String(row[3] ?? ''), Number(row[4] ?? 0));
}

function parseLooseObjectRow(row: unknown): PiholeQueryTuple | null {
	if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
	const o = row as Record<string, unknown>;
	const tsRaw = o.timestamp ?? o.time ?? o.ts;
	const ts = Math.floor(Number(tsRaw));
	if (!Number.isFinite(ts)) return null;
	const domain = String(o.domain ?? o.name ?? '');
	const qtype = String(o.type ?? o.qtype ?? o.query_type ?? '');
	const client =
		String(o.client ?? o.client_ip ?? o.ip ?? o.source ?? o['client.ip'] ?? '');
	return asTuple(ts, qtype, domain, client, Number(o.status ?? 0));
}

/** Interpreta tanto `getAllQueries` (v5) como `GET /api/queries` (v6). */
export function normalizePiholeQueriesPayload(payload: unknown, depth = 0): PiholeQueryTuple[] {
	if (!payload || typeof payload !== 'object' || depth > 4) return [];
	const p = payload as Record<string, unknown>;

	if (Array.isArray(p.queries) && p.queries.length) {
		const out = p.queries.map(parseV6QueryItem).filter((x): x is PiholeQueryTuple => x !== null);
		if (out.length) return out;
	}

	for (const key of ['history', 'results', 'records'] as const) {
		const inner = p[key];
		if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
			const nested = normalizePiholeQueriesPayload(inner, depth + 1);
			if (nested.length) return nested;
		}
	}

	const data = p.data;
	if (!Array.isArray(data) || !data.length) return [];

	const first = data[0];
	if (Array.isArray(first)) {
		return data.map(parseLegacyRow).filter((x): x is PiholeQueryTuple => x !== null);
	}
	return data.map(parseLooseObjectRow).filter((x): x is PiholeQueryTuple => x !== null);
}

/**
 * Obtiene el log de consultas entre `from` y `until` (epoch segundos).
 * 1) API legacy v5 (`admin/api.php?getAllQueries`).
 * 2) API v6 sin sesión (Pi-hole sin contraseña).
 * 3) API v6 con `POST /api/auth` usando `PIHOLE_API_TOKEN` como contraseña de aplicación.
 */
function filterRowsByWindow(rows: PiholeQueryTuple[], from: number, until: number): PiholeQueryTuple[] {
	const inWindow = rows.filter((r) => r[0] >= from && r[0] <= until);
	if (inWindow.length > 0) return inWindow;
	if (rows.length === 0) return rows;
	// Reloj del contenedor desfasado respecto a Pi-hole: ventana anclada al último timestamp.
	const maxTs = Math.max(...rows.map((r) => r[0]));
	const windowSec = Math.max(60, until - from);
	const effectiveFrom = maxTs - windowSec;
	return rows.filter((r) => r[0] >= effectiveFrom && r[0] <= maxTs + 5);
}

function legacyApiUrl(base: string, token: string, from?: number, until?: number): string {
	const u = new URL(`${base}/admin/api.php`);
	if (token) u.searchParams.set('auth', token);
	u.searchParams.set('getAllQueries', '1');
	if (from !== undefined && until !== undefined) {
		u.searchParams.set('from', String(from));
		u.searchParams.set('until', String(until));
	}
	return u.toString();
}

async function wgetJson(url: string): Promise<unknown | null> {
	try {
		const { stdout } = await execFileAsync('wget', ['-qO-', '-T', '25', url], {
			maxBuffer: 64 * 1024 * 1024,
			encoding: 'utf8'
		});
		return JSON.parse(stdout) as unknown;
	} catch {
		return null;
	}
}

async function httpJson(url: string, fetchFn: typeof fetch): Promise<unknown | null> {
	try {
		const res = await fetchFn(url, {
			headers: { accept: 'application/json' },
			signal: AbortSignal.timeout(25_000)
		});
		if (!res.ok) return null;
		return await res.json().catch(() => null);
	} catch {
		return null;
	}
}

/** wget primero: en algunos contenedores `fetch` de Node devuelve cuerpo vacío hacia la LAN. */
async function loadLegacyPayload(
	url: string,
	fetchFn: typeof fetch
): Promise<unknown | null> {
	return (await wgetJson(url)) ?? (await httpJson(url, fetchFn)) ?? (await httpJson(url, globalThis.fetch));
}

async function fetchLegacyGetAll(
	fetchFn: typeof fetch,
	base: string,
	token: string,
	from: number,
	until: number
): Promise<{ ok: boolean; rows: PiholeQueryTuple[] }> {
	const attempts = [
		legacyApiUrl(base, token, from, until),
		legacyApiUrl(base, token)
	];

	for (const url of attempts) {
		const payload = await loadLegacyPayload(url, fetchFn);
		if (!payload) continue;

		const rows =
			url.includes('from=') && url.includes('until=')
				? normalizePiholeQueriesPayload(payload)
				: filterRowsByWindow(normalizePiholeQueriesPayload(payload), from, until);

		if (rows.length) return { ok: true, rows };
	}

	// Último intento: comprobar si al menos respondió la API
	const probe = await loadLegacyPayload(legacyApiUrl(base, token, from, until), fetchFn);
	if (probe !== null) return { ok: true, rows: [] };

	return { ok: false, rows: [] };
}

export async function fetchPiholeQueryLog(
	fetchFn: typeof fetch,
	from: number,
	until: number
): Promise<{
	rows: PiholeQueryTuple[];
	source: 'legacy' | 'v6' | 'empty';
	piHoleReachable: boolean;
}> {
	if (!assertPiholeConfigured().ok) {
		return { rows: [], source: 'empty', piHoleReachable: false };
	}

	const token = piholeApiToken();
	let legacyOk = false;

	for (const base of piholeBaseUrlCandidates()) {
		const legacy = await fetchLegacyGetAll(fetchFn, base, token, from, until);
		if (!legacy.ok) continue;
		legacyOk = true;
		if (legacy.rows.length) {
			return { rows: legacy.rows, source: 'legacy', piHoleReachable: true };
		}
	}

	const root = piholeRootBaseUrl();
	if (!root) {
		return { rows: [], source: 'empty', piHoleReachable: legacyOk };
	}

	const fetchV6Queries = async (
		headers: Record<string, string>,
		disk: boolean
	): Promise<{ ok: boolean; rows: PiholeQueryTuple[] }> => {
		const qUrl = new URL(`${root}/api/queries`);
		qUrl.searchParams.set('from', String(from));
		qUrl.searchParams.set('until', String(until));
		qUrl.searchParams.set('length', '20000');
		if (disk) qUrl.searchParams.set('disk', 'true');
		const res = await fetchFn(qUrl.toString(), {
			headers: { accept: 'application/json', ...headers }
		});
		if (!res.ok) return { ok: false, rows: [] };
		const payload = await res.json().catch(() => null);
		return { ok: true, rows: normalizePiholeQueriesPayload(payload) };
	};

	/** Memoria FTL y, si hace falta, base en disco (consultas antiguas / tras reinicio). */
	const tryV6BothStores = async (headers: Record<string, string>) => {
		let apiResponded = false;
		for (const disk of [false, true] as const) {
			const r = await fetchV6Queries(headers, disk);
			if (r.ok) apiResponded = true;
			if (r.ok && r.rows.length) {
				return { rows: r.rows, apiResponded: true };
			}
		}
		return { rows: [] as PiholeQueryTuple[], apiResponded };
	};

	const v6Unauth = await tryV6BothStores({});
	if (v6Unauth.rows.length) {
		return { rows: v6Unauth.rows, source: 'v6', piHoleReachable: true };
	}

	// Aunque /api/queries anónimo responda 200, puede devolver 0 filas (privacidad). Con token intentamos sesión.
	const tokenTrim = token.trim();
	if (tokenTrim) {
		const session = await piholeV6Login(fetchFn);
		if (session) {
			const v6Auth = await tryV6BothStores({
				'X-FTL-SID': session.sid,
				'X-FTL-CSRF': session.csrf
			});
			if (v6Auth.rows.length) {
				return { rows: v6Auth.rows, source: 'v6', piHoleReachable: true };
			}
			if (v6Auth.apiResponded) {
				return { rows: [], source: 'empty', piHoleReachable: true };
			}
		}
	}

	if (v6Unauth.apiResponded) {
		// v6 responde 200 con 0 filas si legacy no llegó — no tratar como éxito vacío.
		return { rows: [], source: 'empty', piHoleReachable: legacyOk };
	}

	return { rows: [], source: 'empty', piHoleReachable: legacyOk };
}

function isIpv4String(s: string): boolean {
	return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(s.trim());
}

/**
 * Mapa hostname (minúsculas, p. ej. `iphone.lan` / `iphone`) → IPv4 según
 * `GET /api/network/devices` (Pi-hole v6). Vacío si la API no está disponible.
 */
async function httpJsonWithHeaders(
	url: string,
	headers: Record<string, string>,
	fetchFn: typeof fetch
): Promise<unknown | null> {
	try {
		const res = await fetchFn(url, {
			headers: { accept: 'application/json', ...headers },
			signal: AbortSignal.timeout(20_000)
		});
		if (!res.ok) return null;
		return await res.json().catch(() => null);
	} catch {
		return null;
	}
}

export async function fetchPiholeHostnameToIpv4Map(fetchFn: typeof fetch): Promise<Record<string, string>> {
	const root = piholeRootBaseUrl();
	const url = `${root}/api/network/devices?max_devices=500&max_addresses=40`;

	let body =
		(await httpJsonWithHeaders(url, {}, fetchFn)) ??
		(await httpJsonWithHeaders(url, {}, globalThis.fetch)) ??
		(await wgetJson(url));

	if (!body && piholeApiToken().trim()) {
		const s = await piholeV6Login(fetchFn);
		if (s) {
			body =
				(await httpJsonWithHeaders(url, { 'X-FTL-SID': s.sid, 'X-FTL-CSRF': s.csrf }, fetchFn)) ??
				(await httpJsonWithHeaders(url, { 'X-FTL-SID': s.sid, 'X-FTL-CSRF': s.csrf }, globalThis.fetch));
		}
	}

	if (!body || typeof body !== 'object') return {};

	const bodyTyped = body as { devices?: unknown[] };
	const devices = bodyTyped.devices;
	if (!Array.isArray(devices)) return {};

	type Best = { ip: string; lastSeen: number };
	const best = new Map<string, Best>();

	const setKey = (key: string, ip: string, lastSeen: number) => {
		if (!key || !isIpv4String(ip)) return;
		const k = key.trim().toLowerCase();
		const prev = best.get(k);
		if (!prev || lastSeen >= prev.lastSeen) best.set(k, { ip: ip.trim(), lastSeen });
	};

	for (const d of devices) {
		if (!d || typeof d !== 'object') continue;
		const ips = (d as { ips?: unknown[] }).ips;
		if (!Array.isArray(ips)) continue;
		for (const row of ips) {
			if (!row || typeof row !== 'object') continue;
			const o = row as { ip?: unknown; name?: unknown; lastSeen?: unknown };
			const ip = typeof o.ip === 'string' ? o.ip.trim() : '';
			const name = typeof o.name === 'string' ? o.name.trim() : '';
			const lastSeen =
				typeof o.lastSeen === 'number' && Number.isFinite(o.lastSeen)
					? o.lastSeen
					: Math.floor(Number(o.lastSeen)) || 0;
			if (!isIpv4String(ip)) continue;
			if (name) {
				const fq = name.toLowerCase();
				setKey(fq, ip, lastSeen);
				if (fq.endsWith('.lan')) setKey(fq.slice(0, -4), ip, lastSeen);
				if (fq.endsWith('.local')) setKey(fq.slice(0, -6), ip, lastSeen);
			}
		}
	}

	const out: Record<string, string> = {};
	for (const [k, v] of best) out[k] = v.ip;
	return out;
}
