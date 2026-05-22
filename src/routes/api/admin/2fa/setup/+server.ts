import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { rateLimitKey } from '$lib/server/rate-limit';
import { generateTotpSetup, totpStatus } from '$lib/server/totp';

export const prerender = false;

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'openvpn_admin');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const rl = rateLimitKey('admin:2fa_setup', getClientAddress(), { windowMs: 60_000, maxPerWindow: 5 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	if (totpStatus().enabled) {
		return json({ error: 'already_enabled' }, { status: 400, headers: { 'cache-control': 'no-store' } });
	}

	try {
		const setup = await generateTotpSetup('Panel VPN', 'admin');
		return json(setup, { headers: { 'cache-control': 'no-store' } });
	} catch (e: unknown) {
		const msg = String((e as Error)?.message ?? e);
		if (msg.includes('MASTER_KEY_or_SESSION_SECRET')) {
			return json(
				{
					error: 'misconfigured',
					message:
						'Falta MASTER_KEY o SESSION_SECRET (≥32 caracteres) en el .env para guardar el secreto 2FA de forma cifrada.'
				},
				{ status: 500, headers: { 'cache-control': 'no-store' } }
			);
		}
		if (msg.includes('EACCES') || msg.includes('EPERM')) {
			return json(
				{
					error: 'storage_error',
					message: 'No se puede escribir en data/ (permisos del volumen). Revisa el usuario del contenedor.'
				},
				{ status: 500, headers: { 'cache-control': 'no-store' } }
			);
		}
		return json(
			{ error: 'setup_failed', message: msg || 'No se pudo generar el QR 2FA.' },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}
};

