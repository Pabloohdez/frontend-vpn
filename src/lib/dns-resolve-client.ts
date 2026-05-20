/** Lógica compartida (cliente) con `device-resolve.ts` del servidor. */

export type NetmonitorDeviceLite = {
	label: string;
	type: string | null;
	sedeName: string;
	online: boolean;
	hostname?: string | null;
	customName?: string | null;
	manufacturer?: string | null;
};

/** Nombre corto para la tabla + tooltip con detalle completo. */
export function formatDeviceDisplay(
	device: NetmonitorDeviceLite | null,
	clientRaw: string
): { display: string; title: string } {
	const client = String(clientRaw ?? '').trim();

	if (!device) {
		if (!client || client === '—') return { display: '—', title: '' };
		const friendly = piholeClientFriendlyName(client);
		return { display: friendly, title: client };
	}

	const titleParts: string[] = [device.label];
	if (device.hostname?.trim()) titleParts.push(`hostname: ${device.hostname.trim()}`);
	if (device.manufacturer?.trim()) titleParts.push(device.manufacturer.trim());
	if (device.type) titleParts.push(device.type);
	if (device.sedeName) titleParts.push(device.sedeName);
	titleParts.push(device.online ? 'en línea' : 'sin actividad reciente');
	const title = titleParts.join(' · ');

	const custom = device.customName?.trim();
	if (custom) return { display: truncateLabel(custom, 36), title };

	const host = device.hostname?.trim().replace(/\.lan$|\.local$/i, '');
	if (host) return { display: truncateLabel(host.replace(/-/g, ' '), 36), title };

	const mfr = device.manufacturer?.trim();
	if (mfr && mfr.length <= 32) return { display: mfr, title };

	const type = device.type?.trim();
	if (type && type.length <= 24) return { display: type, title };

	return { display: shortenCorporateLabel(device.label), title };
}

function piholeClientFriendlyName(client: string): string {
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(client)) return client;
	return truncateLabel(client.replace(/\.lan$|\.local$/i, '').replace(/-/g, ' '), 36);
}

function shortenCorporateLabel(label: string): string {
	const t = label.trim();
	if (!t) return '—';
	if (t.length <= 32) return t;
	const beforeParen = t.split('(')[0]?.trim();
	if (beforeParen && beforeParen.length >= 3 && beforeParen.length <= 32) return beforeParen;
	const first = t.split(/\s+/)[0] ?? t;
	if (first.length >= 2 && first.length <= 24) return first;
	return truncateLabel(t, 32);
}

function truncateLabel(s: string, max: number): string {
	const t = s.trim();
	if (t.length <= max) return t;
	return `${t.slice(0, max - 1)}…`;
}

export function extractClientIpv4(raw: string): string | null {
	const m = String(raw ?? '').match(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/);
	return m?.[1] ?? null;
}

/** Busca en el log DNS cargado una IPv4 del mismo cliente (p. ej. otra fila con `192.0.2.x (nombre.lan)`). */
export function resolveIpFromDnsQueries(
	clientRaw: string,
	rows: ReadonlyArray<readonly [number, string, string, string, ...unknown[]]>
): string | null {
	const direct = extractClientIpv4(clientRaw);
	if (direct) return direct;

	const keys = hostnameLookupKeys(clientRaw);
	const rawLc = String(clientRaw ?? '').trim().toLowerCase();
	if (!keys.length && !rawLc) return null;

	let bestIp: string | null = null;
	let bestTs = 0;

	for (const row of rows) {
		const c = String(row[3] ?? '').trim();
		if (!c) continue;
		const ip = extractClientIpv4(c);
		if (!ip) continue;
		const cl = c.toLowerCase();
		const match =
			(rawLc && (cl === rawLc || cl.includes(rawLc) || rawLc.includes(cl))) ||
			keys.some((k) => cl.includes(k) || k.includes(cl.replace(/\.lan$|\.local$/, '')));
		if (!match) continue;
		const ts = Number(row[0] ?? 0);
		if (ts >= bestTs) {
			bestTs = ts;
			bestIp = ip;
		}
	}
	return bestIp;
}

export function hostnameLookupKeys(raw: string): string[] {
	const k = String(raw ?? '').trim().toLowerCase();
	if (!k || k.includes(' ')) return [];
	const keys = new Set<string>([k]);
	if (k.endsWith('.lan')) keys.add(k.slice(0, -4));
	if (k.endsWith('.local')) keys.add(k.slice(0, -6));
	const compact = k.replace(/\.lan$|\.local$/, '').replace(/-/g, '_');
	if (compact) keys.add(compact);
	const dashed = compact.replace(/_/g, '-');
	if (dashed) keys.add(dashed);
	return [...keys];
}

export function resolveClientIpv4(
	raw: string,
	hostnameToIpv4: Record<string, string>
): string | null {
	const direct = extractClientIpv4(raw);
	if (direct) return direct;
	for (const c of hostnameLookupKeys(raw)) {
		const ip = hostnameToIpv4[c];
		if (ip && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip;
	}
	return null;
}

export function mergeHostnameMapWithNetmonitor(
	hostnameToIpv4: Record<string, string>,
	netmonitorByIp: Record<string, NetmonitorDeviceLite>
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

/** Añade claves LAN → CN al mapa VPN (Pi-hole a veces reporta la IP local, no la 10.8.0.x). */
export function enrichVpnMapWithLanIps(
	vpnMap: Record<string, string>,
	realLanByVpnIp: Record<string, string>
): Record<string, string> {
	const out = { ...vpnMap };
	for (const [vpnIp, lan] of Object.entries(realLanByVpnIp)) {
		const cn = vpnMap[vpnIp];
		if (cn && lan && !out[lan]) out[lan] = cn;
	}
	return out;
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

/** Texto para filtrar por IP/CN: incluye VPN, LAN, hostname y cliente crudo. */
export function clientSearchHaystack(
	clientRaw: string,
	opts: {
		hostnameToIpv4: Record<string, string>;
		realLanByVpnIp: Record<string, string>;
		vpnMap: Record<string, string>;
		deviceLabel?: string;
		isVpnIp?: (ip: string) => boolean;
	}
): string {
	const isVpn = opts.isVpnIp ?? defaultIsVpnIp;
	const parts: string[] = [String(clientRaw ?? '')];
	const resolved = resolveClientIpv4(clientRaw, opts.hostnameToIpv4);
	if (resolved) {
		parts.push(resolved);
		const cn = opts.vpnMap[resolved];
		if (cn) parts.push(cn);
		const lan = opts.realLanByVpnIp[resolved];
		if (lan) {
			parts.push(lan);
			const cnLan = opts.vpnMap[lan];
			if (cnLan) parts.push(cnLan);
		}
	}
	const lan = resolveLanIp(clientRaw, opts.hostnameToIpv4, opts.realLanByVpnIp, isVpn);
	if (lan) {
		parts.push(lan);
		const cn = opts.vpnMap[lan];
		if (cn) parts.push(cn);
	}
	for (const k of hostnameLookupKeys(clientRaw)) {
		const ip = opts.hostnameToIpv4[k];
		if (ip) parts.push(ip);
	}
	if (opts.deviceLabel && opts.deviceLabel !== '—') parts.push(opts.deviceLabel);
	return parts.join(' ').toLowerCase();
}
