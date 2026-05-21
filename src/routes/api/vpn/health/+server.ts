import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { fetchWithRetries } from '$lib/server/fetch-retry';
import { cacheTtlMs, getCachedJson, setCachedJson } from '$lib/server/upstream-cache';
import { getLastKnown, recordLastKnown } from '$lib/server/upstream-last-known';

export const prerender = false;

const CACHE_KEY = 'vpn:health';

export const GET: RequestHandler = async ({ fetch, request }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const baseUrl = env.VPN_API_BASE_URL;
	if (!baseUrl) {
		return json({ error: 'misconfigured', message: 'Falta VPN_API_BASE_URL en el .env' }, { status: 500 });
	}

	const ttl = cacheTtlMs('UPSTREAM_CACHE_VPN_HEALTH_SEC', 15);
	const cached = getCachedJson<{ ok: boolean; status: number; latency_ms: number; payload: unknown }>(
		CACHE_KEY,
		ttl
	);
	if (cached) {
		return json({ ...cached, cached: true }, { headers: { 'cache-control': 'no-store' } });
	}

	const t0 = Date.now();
	let upstream: Response;
	try {
		upstream = await fetchWithRetries(`${baseUrl}/health`, undefined, { attempts: 3 });
	} catch (e: unknown) {
		const last = getLastKnown('vpn_health');
		return json(
			{
				ok: false,
				status: 0,
				latency_ms: Date.now() - t0,
				payload: { error: 'upstream_unreachable', message: String((e as Error)?.message ?? e) },
				stale: Boolean(last),
				last_known: last
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}
	const latency_ms = Date.now() - t0;
	const payload = await upstream.json().catch(() => ({}));
	const body = { ok: upstream.ok, status: upstream.status, latency_ms, payload };
	if (upstream.ok) {
		setCachedJson(CACHE_KEY, body);
		recordLastKnown('vpn_health', body);
	}
	return json(body, { status: upstream.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
};

