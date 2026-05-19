import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { buildNetworkDevicesList } from '$lib/server/network-devices';

export const prerender = false;

export const GET: RequestHandler = async ({ request, fetch }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	const payload = await buildNetworkDevicesList(fetch);
	return json(payload, { headers: { 'cache-control': 'no-store' } });
};
