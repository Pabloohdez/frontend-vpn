import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sessionCookieOptions } from '$lib/server/auth';
import { cookieOpts, refreshCookieName, accessCookieName, rotateRefresh } from '$lib/server/session-store';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const refresh = cookies.get(refreshCookieName());
	if (!refresh) return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

	const rotated = await rotateRefresh(refresh);
	if (!rotated) return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });

	const secure = sessionCookieOptions(request).secure;
	cookies.set(accessCookieName(), rotated.access, { ...cookieOpts(secure), maxAge: rotated.access_ttl_sec });
	cookies.set(refreshCookieName(), rotated.refresh, { ...cookieOpts(secure), maxAge: rotated.refresh_ttl_sec });

	return json({ ok: true, role: rotated.role }, { headers: { 'cache-control': 'no-store' } });
};

