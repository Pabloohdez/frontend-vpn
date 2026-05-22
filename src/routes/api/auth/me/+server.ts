import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	getRoleFromEventCookies,
	getRoleFromEventCookiesAsync,
	getRoleFromRequestCookie,
	getSessionExpiresAtMs,
	isAuthConfigured,
	listPermissionsForRole,
	shouldUseSecureCookies
} from '$lib/server/auth';
import { isAdmin2faRequired } from '$lib/server/admin-2fa-policy';
import { totpStatus } from '$lib/server/totp';

export const GET: RequestHandler = async ({ request, cookies }) => {
	const cookieHeader = request.headers.get('cookie');
	// Priorizar Cookie header parseado (más fiable con curl/proxies que cookies.get en algunos despliegues).
	const role =
		getRoleFromRequestCookie(cookieHeader) ??
		(await getRoleFromEventCookiesAsync({ cookies })) ??
		getRoleFromEventCookies(cookies);
	const isAdmin = role === 'admin';
	const sessionExpiresAt = getSessionExpiresAtMs(cookieHeader);
	const totp = isAdmin ? totpStatus() : null;
	return json(
		{
			configured: isAuthConfigured(),
			isAdmin,
			role,
			sessionExpiresAt,
			totp: totp
				? {
						enabled: totp.enabled,
						created_at: totp.created_at,
						required: isAdmin2faRequired()
					}
				: null,
			admin2faRequired: isAdmin && isAdmin2faRequired(),
			permissions: role ? listPermissionsForRole(role) : [],
			/** Si login falla en HTTP: debe ser false al acceder por http://IP:puerto */
			secureCookies: shouldUseSecureCookies(request)
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
