import { isPiholeQueryBlockedStatus } from '$lib/server/security-insights';
import { enrichClientWithDevice, resolveClientIpv4 } from '$lib/server/device-resolve';
import type { NetmonitorIpMap } from '$lib/server/netmonitor';
import type { PiholeQueryTuple } from '$lib/server/pihole-query-log';
import { readPrunedIpCnHistory } from '$lib/server/vpn-ipcn-history';

export type DnsQueryEntry = {
	ts: number;
	time: string;
	domain: string;
	qtype: string;
	blocked: boolean;
};

export type DeviceDaySlice = {
	day: string;
	device_key: string;
	label: string;
	client_pihole: string;
	cn: string | null;
	ip: string | null;
	lan_ip: string | null;
	device_type: string | null;
	sede: string | null;
	total: number;
	blocked: number;
	top_domains: { domain: string; count: number }[];
	queries: DnsQueryEntry[];
	truncated: boolean;
	total_queries: number;
};

export type DnsDeviceReport = {
	generated_at: string;
	day: string;
	from: number;
	until: number;
	timezone_note: string;
	devices: DeviceDaySlice[];
	skipped_devices: number;
};

const DEFAULT_MAX_QUERIES = 400;
const MAX_DEVICES = 40;

function buildVpnContext() {
	const hist = readPrunedIpCnHistory();
	const ipToCn: Record<string, string> = {};
	const realLanByVpnIp: Record<string, string> = {};
	for (const [ip, entry] of Object.entries(hist)) {
		if (entry.cn) ipToCn[ip] = entry.cn;
		if (entry.real_lan) realLanByVpnIp[ip] = entry.real_lan;
	}
	return { ipToCn, realLanByVpnIp };
}

function cnForClient(
	client: string,
	ipToCn: Record<string, string>,
	hostnameToIpv4: Record<string, string>
): string | null {
	const ip = resolveClientIpv4(client, hostnameToIpv4);
	if (ip && ipToCn[ip]) return ipToCn[ip];
	return null;
}

function deviceLabel(
	client: string,
	hostnameToIpv4: Record<string, string>,
	realLanByVpnIp: Record<string, string>,
	netmonitorByIp: NetmonitorIpMap
): string {
	const e = enrichClientWithDevice(client, hostnameToIpv4, realLanByVpnIp, netmonitorByIp);
	if (e.device_label?.trim()) return e.device_label.trim();
	const ip = e.resolved_ip ?? e.lan_ip;
	if (ip) return ip;
	const c = client.trim();
	return c || 'Dispositivo desconocido';
}

function formatTime(ts: number): string {
	return new Date(ts * 1000).toLocaleTimeString('es-ES', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false
	});
}

/** Día civil YYYY-MM-DD en zona horaria del servidor. */
export function dayBoundsLocal(day: string): { from: number; until: number } | null {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.trim());
	if (!m) return null;
	const y = Number(m[1]);
	const mo = Number(m[2]) - 1;
	const d = Number(m[3]);
	if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
	const from = Math.floor(new Date(y, mo, d, 0, 0, 0, 0).getTime() / 1000);
	const until = Math.floor(new Date(y, mo, d, 23, 59, 59, 999).getTime() / 1000);
	return { from, until };
}

export { todayLocalIso } from '$lib/dns-report-utils';

export function buildDnsDeviceReport(opts: {
	rows: PiholeQueryTuple[];
	day: string;
	hostnameToIpv4: Record<string, string>;
	netmonitorByIp: NetmonitorIpMap;
	clientFilter?: string | null;
	maxQueriesPerDevice?: number;
}): DnsDeviceReport {
	const bounds = dayBoundsLocal(opts.day);
	if (!bounds) {
		return {
			generated_at: new Date().toISOString(),
			day: opts.day,
			from: 0,
			until: 0,
			timezone_note: 'Fecha inválida',
			devices: [],
			skipped_devices: 0
		};
	}

	const maxQ = opts.maxQueriesPerDevice ?? DEFAULT_MAX_QUERIES;
	const filter = opts.clientFilter?.trim().toLowerCase() ?? '';
	const { ipToCn, realLanByVpnIp } = buildVpnContext();

	type Bucket = {
		queries: DnsQueryEntry[];
		domainCount: Map<string, number>;
		blocked: number;
	};

	const buckets = new Map<string, Bucket>();

	for (const row of opts.rows) {
		const ts = Number(row[0] ?? 0);
		if (!Number.isFinite(ts) || ts < bounds.from || ts > bounds.until) continue;

		const client = String(row[3] ?? '').trim() || '(sin cliente)';
		if (filter) {
			const hay = client.toLowerCase();
			const label = deviceLabel(
				client,
				opts.hostnameToIpv4,
				realLanByVpnIp,
				opts.netmonitorByIp
			).toLowerCase();
			const cn = (cnForClient(client, ipToCn, opts.hostnameToIpv4) ?? '').toLowerCase();
			if (!hay.includes(filter) && !label.includes(filter) && !cn.includes(filter)) continue;
		}

		const domain = String(row[2] ?? '').trim() || '—';
		const qtype = String(row[1] ?? '').trim() || '—';
		const blocked = isPiholeQueryBlockedStatus(Number(row[4] ?? 0));

		let b = buckets.get(client);
		if (!b) {
			b = { queries: [], domainCount: new Map(), blocked: 0 };
			buckets.set(client, b);
		}
		b.queries.push({ ts, time: formatTime(ts), domain, qtype, blocked });
		b.domainCount.set(domain, (b.domainCount.get(domain) ?? 0) + 1);
		if (blocked) b.blocked += 1;
	}

	const ranked = [...buckets.entries()].sort((a, b) => b[1].queries.length - a[1].queries.length);
	const skipped = Math.max(0, ranked.length - MAX_DEVICES);
	const selected = ranked.slice(0, MAX_DEVICES);

	const devices: DeviceDaySlice[] = selected.map(([client, b]) => {
		b.queries.sort((x, y) => x.ts - y.ts);
		const total = b.queries.length;
		const truncated = total > maxQ;
		const shown = truncated ? b.queries.slice(0, maxQ) : b.queries;
		const enriched = enrichClientWithDevice(
			client,
			opts.hostnameToIpv4,
			realLanByVpnIp,
			opts.netmonitorByIp
		);
		const top_domains = [...b.domainCount.entries()]
			.sort((a, c) => c[1] - a[1])
			.slice(0, 15)
			.map(([domain, count]) => ({ domain, count }));

		return {
			day: opts.day,
			device_key: client,
			label: deviceLabel(client, opts.hostnameToIpv4, realLanByVpnIp, opts.netmonitorByIp),
			client_pihole: client,
			cn: cnForClient(client, ipToCn, opts.hostnameToIpv4),
			ip: enriched.resolved_ip,
			lan_ip: enriched.lan_ip,
			device_type: enriched.device_type,
			sede: enriched.sede_name,
			total,
			blocked: b.blocked,
			top_domains,
			queries: shown,
			truncated,
			total_queries: total
		};
	});

	devices.sort((a, b) => a.label.localeCompare(b.label, 'es'));

	return {
		generated_at: new Date().toISOString(),
		day: opts.day,
		from: bounds.from,
		until: bounds.until,
		timezone_note: `Fechas y horas en hora local del servidor (${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'}).`,
		devices,
		skipped_devices: skipped
	};
}
