import { env } from '$env/dynamic/private';

export type NetmonitorDevice = {
	id: number;
	ip: string;
	label: string;
	customName: string | null;
	hostname: string | null;
	mac: string | null;
	type: string | null;
	manufacturer: string | null;
	os: string | null;
	sedeId: number;
	sedeName: string;
	online: boolean;
};

export type NetmonitorIpMap = Record<string, NetmonitorDevice>;

type CacheEntry = {
	at: number;
	map: NetmonitorIpMap;
	reachable: boolean;
};

const TTL_MS = 60_000;
let cache: CacheEntry | null = null;

export function isNetmonitorConfigured(): boolean {
	const base = env.NETMONITOR_BASE_URL?.trim();
	const key = env.NETMONITOR_API_KEY?.trim();
	return Boolean(base && key);
}

function mapFromApiBody(body: {
	by_ip?: Record<
		string,
		{
			id?: number;
			ip?: string;
			mac?: string | null;
			hostname?: string | null;
			customName?: string | null;
			type?: string | null;
			manufacturer?: string | null;
			os?: string | null;
			sedeId?: number;
			sedeName?: string;
			online?: boolean;
		}
	>;
} | null): NetmonitorIpMap {
	const map: NetmonitorIpMap = {};
	for (const [ip, raw] of Object.entries(body?.by_ip ?? {})) {
		if (!raw || typeof raw !== 'object') continue;
		const deviceIp = typeof raw.ip === 'string' ? raw.ip : ip;
		map[deviceIp] = {
			id: Number(raw.id ?? 0),
			ip: deviceIp,
			label: buildLabel({ ...raw, ip: deviceIp }),
			customName: raw.customName ?? null,
			hostname: raw.hostname ?? null,
			mac: raw.mac ?? null,
			type: raw.type ?? null,
			manufacturer: raw.manufacturer ?? null,
			os: raw.os ?? null,
			sedeId: Number(raw.sedeId ?? 0),
			sedeName: String(raw.sedeName ?? ''),
			online: Boolean(raw.online)
		};
	}
	return map;
}

function buildLabel(d: {
	customName?: string | null;
	hostname?: string | null;
	manufacturer?: string | null;
	ip: string;
}): string {
	const custom = d.customName?.trim();
	if (custom) return custom;
	const host = d.hostname?.trim();
	if (host) return host;
	const mfr = d.manufacturer?.trim();
	if (mfr) return mfr;
	return d.ip;
}

export async function fetchNetmonitorIpMap(fetchFn: typeof fetch = fetch): Promise<{
	map: NetmonitorIpMap;
	reachable: boolean;
	configured: boolean;
}> {
	if (!isNetmonitorConfigured()) {
		return { map: {}, reachable: false, configured: false };
	}

	const now = Date.now();
	if (cache && now - cache.at < TTL_MS) {
		return { map: cache.map, reachable: cache.reachable, configured: true };
	}

	const base = env.NETMONITOR_BASE_URL!.replace(/\/$/, '');
	const key = env.NETMONITOR_API_KEY!;

	try {
		const res = await fetchFn(`${base}/api/internal/devices`, {
			headers: {
				Authorization: `Bearer ${key}`,
				'cache-control': 'no-cache'
			},
			signal: AbortSignal.timeout(8000)
		});

		if (!res.ok) {
			cache = { at: now, map: {}, reachable: false };
			return { map: {}, reachable: false, configured: true };
		}

		const body = (await res.json().catch(() => null)) as Parameters<typeof mapFromApiBody>[0];
		const map = mapFromApiBody(body);

		cache = { at: now, map, reachable: true };
		return { map, reachable: true, configured: true };
	} catch {
		cache = { at: now, map: {}, reachable: false };
		return { map: {}, reachable: false, configured: true };
	}
}
