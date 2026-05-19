import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import {
	fetchPiholeHostnameToIpv4Map,
	fetchPiholeQueryLog
} from '$lib/server/pihole-query-log';
import { fetchNetmonitorIpMap } from '$lib/server/netmonitor';
import { aggregateDnsInsights } from '$lib/server/security-insights';
import { bucketizeQueries, type DnsBucketGranularity } from '$lib/server/dns-timeseries';
import { readPrunedIpCnHistory, normalizeVpnVirtualIpKey } from '$lib/server/vpn-ipcn-history';

export const prerender = false;

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

	const rangeRaw = (url.searchParams.get('range') ?? '24h').toLowerCase();
	let windowHours = 24;
	let granularity: DnsBucketGranularity = 'hour';
	if (rangeRaw === '7d') {
		windowHours = 24 * 7;
		granularity = 'day';
	} else if (rangeRaw === '30d') {
		windowHours = 24 * 30;
		granularity = 'day';
	}

	const now = Math.floor(Date.now() / 1000);
	const from = now - windowHours * 3600;

	const { rows, piHoleReachable } = await fetchPiholeQueryLog(fetch, from, now);
	const hostnameToIpv4 = piHoleReachable ? await fetchPiholeHostnameToIpv4Map(fetch) : {};

	const history = readPrunedIpCnHistory();
	const realLanByVpnIp: Record<string, string> = {};
	for (const [virt, v] of Object.entries(history)) {
		const k = normalizeVpnVirtualIpKey(virt);
		if (v?.real_lan) realLanByVpnIp[k] = v.real_lan;
	}

	const { map: netmonitorByIp } = await fetchNetmonitorIpMap(fetch);

	const insights = piHoleReachable
		? aggregateDnsInsights(rows, hostnameToIpv4, { realLanByVpnIp, netmonitorByIp })
		: null;
	const series = bucketizeQueries(rows, from, now, granularity);

	return json(
		{
			range: rangeRaw,
			window_hours: windowHours,
			granularity,
			pi_hole_reachable: piHoleReachable,
			summary: insights
				? {
						total: insights.total,
						blocked: insights.blocked,
						blocked_ratio: insights.blocked_ratio,
						block_estimate: insights.block_estimate
					}
				: { total: 0, blocked: 0, blocked_ratio: null, block_estimate: 'unknown' },
			top_domains: insights?.top_domains.slice(0, 10) ?? [],
			top_clients: insights?.top_clients.slice(0, 10) ?? [],
			series
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
