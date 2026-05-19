import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { fetchWithRetries } from '$lib/server/fetch-retry';

export const prerender = false;

export const GET: RequestHandler = async ({ fetch, request }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const baseUrl = env.VPN_API_BASE_URL;
	if (!baseUrl) {
		return json({ error: 'misconfigured', message: 'Falta VPN_API_BASE_URL en el .env' }, { status: 500 });
	}

	const t0 = Date.now();
	const upstream = await fetchWithRetries(`${baseUrl}/health`, undefined, { attempts: 3 });
	const latency_ms = Date.now() - t0;
	const payload = await upstream.json().catch(() => ({}));

	return json(
		{ ok: upstream.ok, status: upstream.status, latency_ms, payload },
		{ status: upstream.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } }
	);
};

