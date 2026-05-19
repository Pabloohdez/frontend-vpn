import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { fetchPiholeQueryLog } from '$lib/server/pihole-query-log';

export const prerender = false;

/** Diagnóstico con la misma lógica que /api/admin/dns. */
export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const now = Math.floor(Date.now() / 1000);
	const fromRaw = Number(url.searchParams.get('from') ?? String(now - 3600));
	const untilRaw = Number(url.searchParams.get('until') ?? String(now));
	const from = Number.isFinite(fromRaw) ? Math.floor(fromRaw) : now - 3600;
	const until = Number.isFinite(untilRaw) ? Math.floor(untilRaw) : now;

	const { rows, source, piHoleReachable } = await fetchPiholeQueryLog(fetch, from, until);

	return json(
		{
			server_now: now,
			from,
			until,
			pi_hole_reachable: piHoleReachable,
			source,
			parsed_rows: rows.length,
			sample_client: rows[0]?.[3] ?? null,
			sample_domain: rows[0]?.[2] ?? null,
			hint:
				rows.length > 0
					? null
					: 'Si sigue en 0, ejecuta: cd /opt/fronted-vpn && docker compose up -d --force-recreate'
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
