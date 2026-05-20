import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	COOKIE_NAME,
	getRoleFromRequestCookie,
	isAdminFromRequestCookie,
	shouldUseSecureCookies
} from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { accessCookieName, refreshCookieName, revokeSessionByRefresh } from '$lib/server/session-store';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const isAdmin = isAdminFromRequestCookie(request.headers.get('cookie'));
	const role = getRoleFromRequestCookie(request.headers.get('cookie'));

	try {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: role ?? 'unknown',
			action: 'logout',
			success: true,
			remote_ip: getClientAddress(),
			details: { was_admin: isAdmin, role }
		});
	} catch (e) {
		console.error('[auth/logout] audit write failed:', e);
	}

	cookies.delete(COOKIE_NAME, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: shouldUseSecureCookies(request)
	});
	// Nueva sesión: revoca refresh y borra cookies.
	const refresh = cookies.get(refreshCookieName());
	if (refresh) {
		await revokeSessionByRefresh(refresh);
	}
	cookies.delete(accessCookieName(), { path: '/' });
	cookies.delete(refreshCookieName(), { path: '/' });

	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};
