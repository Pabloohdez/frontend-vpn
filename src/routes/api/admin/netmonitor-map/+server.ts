import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { fetchNetmonitorIpMap, isNetmonitorConfigured } from '$lib/server/netmonitor';

export const prerender = false;

/** Mapa IP → dispositivo (netmonitor). Separado de /dns para no bloquear Pi-hole. */
export const GET: RequestHandler = async ({ request, fetch }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	if (!isNetmonitorConfigured()) {
		return json(
			{ by_ip: {}, configured: false, reachable: false },
			{ headers: { 'cache-control': 'no-store' } }
		);
	}

	const { map, reachable, configured } = await fetchNetmonitorIpMap(fetch);
	return json(
		{ by_ip: map, configured, reachable },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
