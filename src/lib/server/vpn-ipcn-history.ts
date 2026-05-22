import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { resolveAuditDbPath } from '$lib/server/audit';

function ttlDays() {
	const raw = Number(env.VPN_IPCN_TTL_DAYS ?? 30);
	return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 30;
}

function historyPath() {
	// Guardamos junto al audit para no introducir otra variable de path.
	const audit = resolveAuditDbPath();
	return path.join(path.dirname(audit), 'vpn-ipcn-history.json');
}

export type IpCnHistory = Record<
	string,
	{
		cn: string;
		last_seen: string; // ISO
		/** IPv4 LAN del cliente (detrás del NAT), si la API OpenVPN la expone. */
		real_lan?: string;
	}
>;

export function extractFirstIpv4(s: unknown): string | null {
	if (typeof s !== 'string') return null;
	const m = s.trim().match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
	return m?.[1] ?? null;
}

/** Clave canónica para correlacionar con Pi-hole (solo la IPv4, sin /32 ni puerto). */
export function normalizeVpnVirtualIpKey(key: string): string {
	return extractFirstIpv4(key) ?? key.trim();
}

function lanIpFromOpenVpnClient(c: { real_ip?: unknown; real_address?: unknown }): string | null {
	const fromRealIp = extractFirstIpv4(c.real_ip);
	if (fromRealIp) return fromRealIp;
	return extractFirstIpv4(c.real_address);
}

export function readIpCnHistory(): IpCnHistory {
	const p = historyPath();
	if (!fs.existsSync(p)) return {};
	try {
		const raw = fs.readFileSync(p, 'utf-8');
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed as IpCnHistory;
		return {};
	} catch {
		return {};
	}
}

function pruneHistory(history: IpCnHistory, nowMs = Date.now()) {
	const cutoffMs = nowMs - ttlDays() * 24 * 60 * 60 * 1000;
	for (const [ip, v] of Object.entries(history)) {
		const ts = Date.parse(v?.last_seen ?? '');
		if (!Number.isFinite(ts) || ts < cutoffMs) delete history[ip];
	}
}

export function writeIpCnHistory(next: IpCnHistory) {
	const p = historyPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(next, null, 2), { encoding: 'utf-8' });
}

export function updateIpCnHistoryFromStatus(
	clients: Array<{
		cn?: unknown;
		common_name?: unknown;
		virtual_address?: unknown;
		real_ip?: unknown;
		real_address?: unknown;
	}>,
	nowIso = new Date().toISOString()
) {
	const history = readIpCnHistory();
	pruneHistory(history, Date.parse(nowIso) || Date.now());

	for (const c of clients ?? []) {
		const virtRaw = typeof c?.virtual_address === 'string' ? c.virtual_address.trim() : '';
		const ip = extractFirstIpv4(virtRaw);
		if (!ip) continue;
		const cn =
			typeof c?.cn === 'string'
				? c.cn.trim()
				: typeof c?.common_name === 'string'
					? c.common_name.trim()
					: '';
		if (!cn) continue;

		const lan = lanIpFromOpenVpnClient(c);
		const prev = history[ip];
		const mergedLan = lan ?? prev?.real_lan;
		history[ip] = {
			cn,
			last_seen: nowIso,
			...(mergedLan ? { real_lan: mergedLan } : {})
		};
	}

	// Limpieza defensiva: evitar crecimiento infinito.
	// Conserva las N entradas más recientes por last_seen.
	const maxEntries = 2048;
	const keys = Object.keys(history);
	if (keys.length > maxEntries) {
		keys.sort((a, b) => {
			const ta = Date.parse(history[a]?.last_seen ?? '') || 0;
			const tb = Date.parse(history[b]?.last_seen ?? '') || 0;
			return tb - ta;
		});
		const keep = new Set(keys.slice(0, maxEntries));
		for (const k of keys) {
			if (!keep.has(k)) delete history[k];
		}
	}

	writeIpCnHistory(history);
}

export function readPrunedIpCnHistory() {
	const history = readIpCnHistory();
	pruneHistory(history);
	return history;
}

/** Actualiza histórico IP↔CN desde VM1 (best-effort, p. ej. antes de políticas por CN). */
export async function refreshIpCnHistoryBestEffort(fetchFn: typeof fetch) {
	const baseUrl = (env.VPN_API_BASE_URL ?? '').trim();
	const apiKey = (env.VPN_API_KEY ?? '').trim();
	if (!baseUrl || !apiKey) return;
	try {
		const { fetchVm1 } = await import('$lib/server/vm1');
		const upstream = await fetchVm1(`${baseUrl}/api/v1/status`, {
			headers: { 'X-API-Key': apiKey }
		});
		if (!upstream.ok) return;
		const data = (await upstream.json().catch(() => null)) as {
			connected_clients?: unknown[];
		} | null;
		if (data?.connected_clients && Array.isArray(data.connected_clients)) {
			updateIpCnHistoryFromStatus(data.connected_clients as Parameters<typeof updateIpCnHistoryFromStatus>[0]);
		}
	} catch {
		/* ignore */
	}
}

