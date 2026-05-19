import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { readPrunedIpCnHistory, normalizeVpnVirtualIpKey } from '$lib/server/vpn-ipcn-history';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const history = readPrunedIpCnHistory();
	const virtual_to_real_lan: Record<string, string> = {};
	const ip_to_cn: Record<string, string> = {};
	for (const [virt, v] of Object.entries(history)) {
		const k = normalizeVpnVirtualIpKey(virt);
		ip_to_cn[k] = v.cn;
		if (v?.real_lan) {
			virtual_to_real_lan[k] = v.real_lan;
			// Pi-hole puede registrar la IP LAN; así el filtro por IP/CN también encuentra esas filas.
			if (!ip_to_cn[v.real_lan]) ip_to_cn[v.real_lan] = v.cn;
		}
	}
	return json(
		{
			ip_to_cn,
			virtual_to_real_lan,
			meta: {
				entries: Object.keys(history).length
			}
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};

