import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { totpStatus } from '$lib/server/totp';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'openvpn_admin');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });
	return json(totpStatus(), { headers: { 'cache-control': 'no-store' } });
};

