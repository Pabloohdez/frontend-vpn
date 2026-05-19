import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { mergeHostnameMapWithNetmonitor } from '$lib/server/device-resolve';
import { fetchNetmonitorIpMap } from '$lib/server/netmonitor';
import { fetchPiholeHostnameToIpv4Map, fetchPiholeQueryLog } from '$lib/server/pihole-query-log';

export const prerender = false;

// Pi-hole v5: GET /admin/api.php?getAllQueries&from=&until=
// Pi-hole v6: GET /api/queries (ver `pihole-query-log.ts`)
export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json(
			{
				error: 'misconfigured',
				message: 'Falta PIHOLE_BASE_URL en el .env'
			},
			{ status: 500 }
		);
	}

	const now = Math.floor(Date.now() / 1000);
	const fromRaw = Number(url.searchParams.get('from') ?? String(now - 3600));
	const untilRaw = Number(url.searchParams.get('until') ?? String(now));
	const from = Number.isFinite(fromRaw) ? Math.max(0, Math.floor(fromRaw)) : now - 3600;
	const until = Number.isFinite(untilRaw) ? Math.max(0, Math.floor(untilRaw)) : now;

	const { rows, source, piHoleReachable } = await fetchPiholeQueryLog(fetch, from, until);

	if (!piHoleReachable) {
		return json(
			{
				error: 'upstream_error',
				message:
					'No se pudo leer el log de consultas de Pi-hole (ni API legacy ni v6). Revisa PIHOLE_BASE_URL, red y en v6 la contraseña de aplicación en PIHOLE_API_TOKEN.',
				data: [],
				meta: { source, hostname_to_ipv4: {} }
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	const [hostnameBase, netmonitor] = await Promise.all([
		fetchPiholeHostnameToIpv4Map(fetch),
		fetchNetmonitorIpMap(fetch)
	]);
	const hostnameToIpv4 = mergeHostnameMapWithNetmonitor(hostnameBase, netmonitor.map);

	return json(
		{
			data: rows,
			meta: {
				source,
				from,
				until,
				hostname_to_ipv4: hostnameToIpv4,
				netmonitor_by_ip: netmonitor.map,
				netmonitor_reachable: netmonitor.reachable,
				hostname_map_size: Object.keys(hostnameToIpv4).length,
				count: rows.length,
				pi_hole_reachable: true
			}
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};

