import { extractClientIpv4, hostnameLookupKeys } from '$lib/dns-resolve-client';
import { fetchPiholeQueryLog, type PiholeQueryTuple } from '$lib/server/pihole-query-log';
import { isIpv4, normalizeIp } from '$lib/server/internet-blocks-store';
import { piholeV6Login, piholeV6Request } from '$lib/server/pihole-v6-session';

function extractClients(data: unknown): Array<{ ip?: string; name?: string; comment?: string }> {
	if (!data || typeof data !== 'object') return [];
	const o = data as Record<string, unknown>;
	const arr = Array.isArray(o.clients) ? o.clients : Array.isArray(o.data) ? o.data : Array.isArray(data) ? data : [];
	const out: Array<{ ip?: string; name?: string; comment?: string }> = [];
	for (const c of arr) {
		if (!c || typeof c !== 'object') continue;
		const co = c as Record<string, unknown>;
		out.push({
			ip: typeof co.ip === 'string' ? co.ip : undefined,
			name: typeof co.name === 'string' ? co.name : undefined,
			comment: typeof co.comment === 'string' ? co.comment : undefined
		});
	}
	return out;
}

function matchClientKeys(clientRaw: string, candidate: string): boolean {
	const keys = hostnameLookupKeys(clientRaw);
	const cand = candidate.trim().toLowerCase();
	const raw = clientRaw.trim().toLowerCase();
	if (!cand) return false;
	if (raw && (cand === raw || cand.includes(raw) || raw.includes(cand))) return true;
	return keys.some((k) => cand.includes(k) || k.includes(cand.replace(/\.lan$|\.local$/, '')));
}

async function resolveFromPiholeClients(
	fetchFn: typeof fetch,
	clientRaw: string
): Promise<string | null> {
	const session = await piholeV6Login(fetchFn);
	if (!session) return null;
	const list = await piholeV6Request(fetchFn, 'GET', '/api/clients', { session });
	if (!list.ok) return null;

	for (const c of extractClients(list.data)) {
		const cip = c.ip?.trim();
		if (cip && isIpv4(cip) && matchClientKeys(clientRaw, `${cip} ${c.name ?? ''} ${c.comment ?? ''}`)) {
			return cip;
		}
		const name = c.name?.trim();
		if (name && matchClientKeys(clientRaw, name) && cip && isIpv4(cip)) return cip;
	}
	return null;
}

function resolveFromQueryRows(clientRaw: string, rows: PiholeQueryTuple[]): string | null {
	let best: string | null = null;
	let bestTs = 0;
	for (const row of rows) {
		const c = String(row[3] ?? '');
		const ip = extractClientIpv4(c);
		if (!ip || !matchClientKeys(clientRaw, c)) continue;
		const ts = Number(row[0] ?? 0);
		if (ts >= bestTs) {
			bestTs = ts;
			best = ip;
		}
	}
	return best;
}

/** Resuelve IPv4 para bloquear a partir de lo que Pi-hole registró (sin pedir la IP al usuario). */
export async function resolveInternetBlockIp(
	fetchFn: typeof fetch,
	opts: { ip?: string; clientRaw?: string }
): Promise<{ ip: string | null; source?: string; message?: string }> {
	const ipHint = normalizeIp(opts.ip ?? '');
	if (ipHint && isIpv4(ipHint)) return { ip: ipHint, source: 'manual' };

	const clientRaw = String(opts.clientRaw ?? '').trim();
	if (!clientRaw) {
		return { ip: null, message: 'Falta el identificador del cliente (consulta DNS).' };
	}

	const fromText = extractClientIpv4(clientRaw);
	if (fromText && isIpv4(fromText)) return { ip: fromText, source: 'query_client_field' };

	const fromClients = await resolveFromPiholeClients(fetchFn, clientRaw);
	if (fromClients) return { ip: fromClients, source: 'pihole_clients' };

	const until = Math.floor(Date.now() / 1000);
	const from = until - 6 * 3600;
	const { rows } = await fetchPiholeQueryLog(fetchFn, from, until);
	const fromLog = resolveFromQueryRows(clientRaw, rows);
	if (fromLog) return { ip: fromLog, source: 'pihole_queries' };

	return {
		ip: null,
		message:
			'Pi-hole solo registró el nombre de este cliente, sin IP en las últimas horas. Cuando vuelva a hacer una consulta DNS, la IP debería aparecer en la tabla; también puedes bloquearlo desde el router (dispositivos conectados).'
	};
}
