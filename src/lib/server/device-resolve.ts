import type { NetmonitorDevice, NetmonitorIpMap } from '$lib/server/netmonitor';

export function extractClientIpv4(raw: string): string | null {
	const m = String(raw ?? '').match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
	return m?.[1] ?? null;
}

function hostnameLookupKeys(raw: string): string[] {
	const k = String(raw ?? '').trim().toLowerCase();
	if (!k || k.includes(' ')) return [];
	const keys = new Set<string>([k]);
	if (k.endsWith('.lan')) keys.add(k.slice(0, -4));
	if (k.endsWith('.local')) keys.add(k.slice(0, -6));
	// Pi-hole: "S23-de-Delia.lan" vs inventario "S23_de_Delia"
	const compact = k.replace(/\.lan$|\.local$/, '').replace(/-/g, '_');
	if (compact) keys.add(compact);
	const dashed = compact.replace(/_/g, '-');
	if (dashed) keys.add(dashed);
	return [...keys];
}

export function resolveClientIpv4(raw: string, hostnameToIpv4: Record<string, string>): string | null {
	const direct = extractClientIpv4(raw);
	if (direct) return direct;
	for (const c of hostnameLookupKeys(raw)) {
		const ip = hostnameToIpv4[c];
		if (ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
	}
	return null;
}

/** Añade hostname/MAC de netmonitor al mapa Pi-hole (hostname → IPv4). */
export function mergeHostnameMapWithNetmonitor(
	hostnameToIpv4: Record<string, string>,
	netmonitorByIp: NetmonitorIpMap
): Record<string, string> {
	const out = { ...hostnameToIpv4 };
	const put = (key: string, ip: string) => {
		const k = key.trim().toLowerCase();
		if (k && !out[k]) out[k] = ip;
	};
	for (const [ip, dev] of Object.entries(netmonitorByIp)) {
		const host = dev.hostname?.trim();
		if (host) {
			put(host, ip);
			for (const k of hostnameLookupKeys(host)) put(k, ip);
		}
		const name = dev.customName?.trim();
		if (name) {
			put(name, ip);
			for (const k of hostnameLookupKeys(name)) put(k, ip);
		}
	}
	return out;
}

export function defaultIsVpnIp(ip: string): boolean {
	return ip.startsWith('10.8.0.');
}

export function resolveLanIp(
	clientRaw: string,
	hostnameToIpv4: Record<string, string>,
	realLanByVpnIp: Record<string, string>,
	isVpnIp: (ip: string) => boolean = defaultIsVpnIp
): string | null {
	const ip = resolveClientIpv4(clientRaw, hostnameToIpv4);
	if (!ip) return null;
	const lan = realLanByVpnIp[ip];
	if (lan) return lan;
	if (!isVpnIp(ip)) return ip;
	return null;
}

export function lookupDeviceByLanIp(
	lanIp: string | null | undefined,
	map: NetmonitorIpMap
): NetmonitorDevice | null {
	if (!lanIp) return null;
	return map[lanIp] ?? null;
}

export function enrichClientWithDevice(
	clientRaw: string,
	hostnameToIpv4: Record<string, string>,
	realLanByVpnIp: Record<string, string>,
	netmonitorByIp: NetmonitorIpMap
): {
	resolved_ip: string | null;
	lan_ip: string | null;
	device_label: string | null;
	device_type: string | null;
	sede_name: string | null;
	device_online: boolean | null;
} {
	const resolved_ip = resolveClientIpv4(clientRaw, hostnameToIpv4);
	const lan_ip = resolveLanIp(clientRaw, hostnameToIpv4, realLanByVpnIp);
	const dev = lookupDeviceByLanIp(lan_ip, netmonitorByIp);
	return {
		resolved_ip,
		lan_ip,
		device_label: dev?.label ?? null,
		device_type: dev?.type ?? null,
		sede_name: dev?.sedeName || null,
		device_online: dev ? dev.online : null
	};
}
