import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchWithRetries } from '$lib/server/fetch-retry';
import { piholeAdminApiUrl } from '$lib/server/pihole-list-fetch';
import { assertPiholeConfigured, piholeApiToken } from '$lib/server/pihole';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { cacheTtlMs, getCachedJson, setCachedJson } from '$lib/server/upstream-cache';
import { getLastKnown, recordLastKnown } from '$lib/server/upstream-last-known';

export const prerender = false;

const CACHE_KEY = 'pihole:health';

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

	const ttl = cacheTtlMs('UPSTREAM_CACHE_PIHOLE_HEALTH_SEC', 20);
	const cached = getCachedJson<{
		ok: boolean;
		status: number;
		latency_ms: number;
		payload: unknown;
	}>(CACHE_KEY, ttl);
	if (cached) {
		return json({ ...cached, cached: true }, { headers: { 'Cache-Control': 'no-store' } });
	}

	const api = new URL(piholeAdminApiUrl());
	const token = piholeApiToken();
	if (token) api.searchParams.set('auth', token);
	api.searchParams.set('summaryRaw', '1');

	const t0 = Date.now();
	let upstream: Response;
	try {
		upstream = await fetchWithRetries(api.toString(), { headers: { accept: 'application/json' } }, { attempts: 3 });
	} catch (e: unknown) {
		const last = getLastKnown('pihole_health');
		return json(
			{
				ok: false,
				status: 0,
				latency_ms: Date.now() - t0,
				payload: { error: 'upstream_unreachable', message: String((e as Error)?.message ?? e) },
				stale: Boolean(last),
				last_known: last
			},
			{ status: 502, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	const payload = await upstream.json().catch(() => null);
	const body = {
		ok: upstream.ok,
		status: upstream.status,
		latency_ms: Date.now() - t0,
		payload
	};
	if (upstream.ok) {
		setCachedJson(CACHE_KEY, body);
		recordLastKnown('pihole_health', body);
	}
	return json(body, { status: upstream.ok ? 200 : 502, headers: { 'Cache-Control': 'no-store' } });
};

