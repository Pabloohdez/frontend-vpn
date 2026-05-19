import { fetchPiholeQueryLog } from '$lib/server/pihole-query-log';
import { checkDomainViaPiholeDns } from '$lib/server/pihole-dns-check';

function baseToken(domain: string): string {
	const parts = domain.trim().toLowerCase().replace(/^\.+/, '').split('.').filter(Boolean);
	if (parts.length < 2) return parts[0] ?? '';
	return parts[parts.length - 2];
}

/** Dominios vistos en el log reciente que parecen del mismo sitio y aún no devuelven 0.0.0.0 en Pi-hole. */
export async function findRelatedUnblockedDomains(
	fetchFn: typeof fetch,
	domain: string,
	fromSec: number,
	untilSec: number,
	limit = 12
): Promise<{ domain: string; count: number; blocked: boolean }[]> {
	const token = baseToken(domain);
	if (!token || token.length < 3) return [];

	const { rows } = await fetchPiholeQueryLog(fetchFn, fromSec, untilSec);
	const counts = new Map<string, number>();

	for (const row of rows) {
		const dom = String(row[2] ?? '')
			.trim()
			.toLowerCase();
		if (!dom || !dom.includes(token)) continue;
		if (dom === domain.trim().toLowerCase()) continue;
		counts.set(dom, (counts.get(dom) ?? 0) + 1);
	}

	const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
	const out: { domain: string; count: number; blocked: boolean }[] = [];

	for (const [dom, count] of sorted) {
		const check = await checkDomainViaPiholeDns(dom);
		if (!check.blocked) out.push({ domain: dom, count, blocked: false });
	}

	return out;
}
