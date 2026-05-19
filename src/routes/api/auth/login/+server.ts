import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	buildSessionCookieValue,
	COOKIE_NAME,
	isAuthConfigured,
	MAX_LOGIN_PASSWORD_LENGTH,
	sessionCookieOptions,
	verifyPasswordAndGetRole
} from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { rateLimitLogin } from '$lib/server/rate-limit';

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
	await writeAudit({
		ts: new Date().toISOString(),
		actor: ok && role ? role : 'unknown',
		action: 'login',
		success: ok,
		remote_ip: getClientAddress(),
		details: ok ? null : { reason: 'invalid_password' }
	});

	if (!ok || !role) return json({ error: 'unauthorized' }, { status: 401 });

	cookies.set(COOKIE_NAME, buildSessionCookieValue(role), sessionCookieOptions(request));

	return json({ ok: true, role }, { headers: { 'cache-control': 'no-store' } });
};
