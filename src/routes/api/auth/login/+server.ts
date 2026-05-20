import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	COOKIE_NAME,
	isAuthConfigured,
	MAX_LOGIN_PASSWORD_LENGTH,
	sessionCookieOptions,
	verifyPasswordAndGetRole
} from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { rateLimitLogin } from '$lib/server/rate-limit';
import { cookieOpts, accessCookieName, refreshCookieName, createSession } from '$lib/server/session-store';
import { totpStatus, verifyTotpOrRecovery } from '$lib/server/totp';
import { lockoutCheck } from '$lib/server/rate-limit';

export const POST: RequestHandler = async (event) => {
	const { request, getClientAddress, cookies } = event;
	if (!isAuthConfigured()) {
		return json({ error: 'misconfigured' }, { status: 500 });
	}

	const ip = getClientAddress();
	const rl = rateLimitLogin(ip);
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{
				status: 429,
				headers: {
					'Retry-After': String(rl.retryAfterSec),
					'cache-control': 'no-store'
				}
			}
		);
	}

	const body = await request.json().catch(() => null);
	const password = body?.password;
	if (typeof password !== 'string') return json({ error: 'bad_request' }, { status: 400 });
	if (password.length > MAX_LOGIN_PASSWORD_LENGTH) {
		return json({ error: 'bad_request' }, { status: 400, headers: { 'cache-control': 'no-store' } });
	}

	const role = verifyPasswordAndGetRole(password);
	const ok = Boolean(role);

	// Lockout por IP (y por rol cuando haya role). Se aplica solo a fallos.
	if (!ok) {
		const lock = await lockoutCheck(`login_ip:${ip}`);
		if (!lock.ok) {
			return json(
				{ error: 'locked', retryAfterSec: lock.retryAfterSec },
				{ status: 429, headers: { 'Retry-After': String(lock.retryAfterSec), 'cache-control': 'no-store' } }
			);
		}
	}

	// 2FA obligatorio para admin si está habilitado
	if (ok && role === 'admin' && totpStatus().enabled) {
		const code = String(body?.totp ?? '').trim();
		const v = verifyTotpOrRecovery(code);
		if (!v.ok) {
			await writeAudit({
				ts: new Date().toISOString(),
				actor: 'admin',
				action: 'login',
				success: false,
				remote_ip: getClientAddress(),
				details: { reason: 'totp_required_or_invalid' }
			});
			return json({ error: 'totp_required' }, { status: 401, headers: { 'cache-control': 'no-store' } });
		}
	}
	await writeAudit({
		ts: new Date().toISOString(),
		actor: ok && role ? role : 'unknown',
		action: 'login',
		success: ok,
		remote_ip: getClientAddress(),
		details: ok ? null : { reason: 'invalid_password' }
	});

	if (!ok || !role) return json({ error: 'unauthorized' }, { status: 401 });

	// Intentar sesión nueva con Redis; fallback a cookie legacy si Redis no está.
	const sess = await createSession(role);
	if (sess) {
		const secure = sessionCookieOptions(request).secure;
		cookies.set(accessCookieName(), sess.access, { ...cookieOpts(secure), maxAge: sess.access_ttl_sec });
		cookies.set(refreshCookieName(), sess.refresh, { ...cookieOpts(secure), maxAge: sess.refresh_ttl_sec });
		// Limpia legacy si existía
		cookies.delete(COOKIE_NAME, { path: '/' });
	} else {
		// Legacy: mantiene compatibilidad si Redis no está disponible
		const { buildSessionCookieValue } = await import('$lib/server/auth');
		cookies.set(COOKIE_NAME, buildSessionCookieValue(role), sessionCookieOptions(request));
	}

	return json({ ok: true, role }, { headers: { 'cache-control': 'no-store' } });
};
