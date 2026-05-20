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

	const setup = await generateTotpSetup('Panel VPN', 'admin');
	return json(setup, { headers: { 'cache-control': 'no-store' } });
};

