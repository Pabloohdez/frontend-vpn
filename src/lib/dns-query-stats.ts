/** Estadísticas ligeras sobre filas DNS [ts, type, domain, client, status]. */
export type DnsQueryRow = [number, string, string, string, number];

export function topPiholeClients(rows: DnsQueryRow[], limit = 20): { client: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const row of rows) {
		const raw = String(row[3] ?? '').trim();
		const key = raw || '(sin cliente / privacidad Pi-hole)';
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()]
		.map(([client, count]) => ({ client, count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

/** Coincidencias solo por dominio o cliente crudo (ignora filtros VPN/IP/CN). */
export function countBroadSearch(rows: DnsQueryRow[], needle: string): number {
	const n = needle.trim().toLowerCase();
	if (!n) return 0;
	let c = 0;
	for (const row of rows) {
		const domain = String(row[2] ?? '').toLowerCase();
		const client = String(row[3] ?? '').toLowerCase();
		const type = String(row[1] ?? '').toLowerCase();
		if (domain.includes(n) || client.includes(n) || type.includes(n)) c++;
	}
	return c;
}
