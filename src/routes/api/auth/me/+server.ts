import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getRoleFromEventCookies,
	getRoleFromEventCookiesAsync,
	getRoleFromRequestCookie,
	getSessionExpiresAtMs,
	isAuthConfigured,
	shouldUseSecureCookies
} from '$lib/server/auth';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const cookieHeader = request.headers.get('cookie');
	const role =
		(await getRoleFromEventCookiesAsync({ cookies })) ??
		getRoleFromEventCookies(cookies) ??
		getRoleFromRequestCookie(cookieHeader);
	const isAdmin = role === 'admin';
	const sessionExpiresAt = getSessionExpiresAtMs(cookieHeader);
	return json(
		{
			configured: isAuthConfigured(),
			isAdmin,
			role,
			sessionExpiresAt,
			/** Si login falla en HTTP: debe ser false al acceder por http://IP:puerto */
			secureCookies: shouldUseSecureCookies(request)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
