import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { collectSecurityInsights } from '$lib/server/security-insights-collect';

export const prerender = false;

const DEFAULT_WINDOW_H = 24;
const AUDIT_DAYS = 7;

export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json(
			{ error: 'misconfigured', message: 'Falta PIHOLE_BASE_URL en el .env' },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}

	const wRaw = Number(url.searchParams.get('window_hours') ?? String(DEFAULT_WINDOW_H));
	const windowHours = Number.isFinite(wRaw) ? Math.min(168, Math.max(1, Math.floor(wRaw))) : DEFAULT_WINDOW_H;

	const data = await collectSecurityInsights(fetch, windowHours, AUDIT_DAYS);

	return json(data, { status: 200, headers: { 'cache-control': 'no-store' } });
};
