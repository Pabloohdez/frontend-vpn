import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import {
	fetchPiholeHostnameToIpv4Map,
	fetchPiholeQueryLog
} from '$lib/server/pihole-query-log';
import { fetchNetmonitorIpMap } from '$lib/server/netmonitor';
import {
	aggregateAuditInsights,
	aggregateDnsInsights,
	buildSecurityAlerts
} from '$lib/server/security-insights';
import { readPrunedIpCnHistory, normalizeVpnVirtualIpKey } from '$lib/server/vpn-ipcn-history';

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

	const {
		map: netmonitorByIp,
		reachable: netmonitor_reachable,
		configured: netmonitor_configured
	} = await fetchNetmonitorIpMap(fetch);

	const audit = await aggregateAuditInsights(AUDIT_DAYS);
	const dns = piHoleReachable
		? aggregateDnsInsights(rows, hostnameToIpv4, { realLanByVpnIp, netmonitorByIp })
		: null;

	const alerts = buildSecurityAlerts({
		audit,
		audit_days: AUDIT_DAYS,
		pi_hole_reachable: piHoleReachable,
		netmonitor_configured,
		netmonitor_reachable
	});

	return json(
		{
			window_hours: windowHours,
			audit_days: AUDIT_DAYS,
			pi_hole_reachable: piHoleReachable,
			netmonitor_configured,
			netmonitor_reachable,
			dns,
			audit,
			alerts
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
