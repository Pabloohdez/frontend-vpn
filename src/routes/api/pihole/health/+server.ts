import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchWithRetries } from '$lib/server/fetch-retry';
import { piholeAdminApiUrl } from '$lib/server/pihole-list-fetch';
import { assertPiholeConfigured, piholeApiToken } from '$lib/server/pihole';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';

export const prerender = false;

export const GET: RequestHandler = async ({ fetch, request }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json(
			{
				ok: false,
				status: 500,
				latency_ms: -1,
				payload: { error: 'misconfigured', message: 'Falta PIHOLE_BASE_URL en el .env' }
			},
			{ status: 500, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	const api = new URL(piholeAdminApiUrl());
	const token = piholeApiToken();
	if (token) api.searchParams.set('auth', token);
	api.searchParams.set('summaryRaw', '1');

	const t0 = Date.now();
	let upstream: Response;
	try {
		upstream = await fetchWithRetries(api.toString(), { headers: { accept: 'application/json' } }, { attempts: 3 });
	} catch (e: any) {
		return json(
			{
				ok: false,
				status: 0,
				latency_ms: Date.now() - t0,
				payload: { error: 'fetch_failed', message: String(e?.message ?? e) }
			},
			{ status: 502, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	const payload = await upstream.json().catch(() => null);
	return json(
		{
			ok: upstream.ok,
			status: upstream.status,
			latency_ms: Date.now() - t0,
			payload
		},
		{ status: upstream.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } }
	);
};

