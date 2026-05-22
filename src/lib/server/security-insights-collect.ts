import { assertPiholeConfigured } from '$lib/server/pihole';
import {
	fetchPiholeHostnameToIpv4Map,
	fetchPiholeQueryLog
} from '$lib/server/pihole-query-log';
import { fetchNetmonitorIpMap } from '$lib/server/netmonitor';
import {
	aggregateAuditInsights,
	aggregateDnsInsights,
	buildSecurityAlerts,
	detectDnsAnomalies,
	detectDnsTunnelingLike,
	type AuditInsights,
	type DnsAnomaly,
	type DnsInsights,
	type DnsThreatFinding,
	type SecurityAlert
} from '$lib/server/security-insights';
import { readPrunedIpCnHistory, normalizeVpnVirtualIpKey } from '$lib/server/vpn-ipcn-history';

const BASELINE_DAYS = 7;

export type CollectedSecurityInsights = {
	window_hours: number;
	audit_days: number;
	pi_hole_reachable: boolean;
	netmonitor_configured: boolean;
	netmonitor_reachable: boolean;
	dns: DnsInsights | null;
	audit: AuditInsights;
	anomalies: DnsAnomaly[];
	threats: DnsThreatFinding[];
	alerts: SecurityAlert[];
};

/** Recoge métricas DNS + alertas (UI, overview y cron de correo). */
export async function collectSecurityInsights(
	fetchFn: typeof fetch,
	windowHours: number,
	auditDays = 7
): Promise<CollectedSecurityInsights> {
	const w = Number.isFinite(windowHours) ? Math.min(168, Math.max(1, Math.floor(windowHours))) : 24;
	const auditD = Number.isFinite(auditDays) ? Math.max(1, Math.floor(auditDays)) : 7;
	const audit = await aggregateAuditInsights(auditD);

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return {
			window_hours: w,
			audit_days: auditD,
			pi_hole_reachable: false,
			netmonitor_configured: false,
			netmonitor_reachable: false,
			dns: null,
			audit,
			anomalies: [],
			threats: [],
			alerts: buildSecurityAlerts({
				audit,
				audit_days: auditD,
				pi_hole_reachable: false
			})
		};
	}

	const now = Math.floor(Date.now() / 1000);
	const from = now - w * 3600;
	const { rows, piHoleReachable } = await fetchPiholeQueryLog(fetchFn, from, now);
	const hostnameToIpv4 = piHoleReachable ? await fetchPiholeHostnameToIpv4Map(fetchFn) : {};

	const baselineFrom = from - BASELINE_DAYS * 24 * 3600;
	let baselineRows: typeof rows = [];
	if (piHoleReachable) {
		const r = await fetchPiholeQueryLog(fetchFn, baselineFrom, from);
		baselineRows = r.rows;
	}

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
	} = await fetchNetmonitorIpMap(fetchFn);

	const dns = piHoleReachable
		? aggregateDnsInsights(rows, hostnameToIpv4, { realLanByVpnIp, netmonitorByIp })
		: null;

	const anomalies = piHoleReachable
		? detectDnsAnomalies({
				current_rows: rows,
				baseline_rows: baselineRows,
				current_window_hours: w,
				baseline_window_hours: BASELINE_DAYS * 24,
				hostnameToIpv4,
				netmonitorByIp,
				realLanByVpnIp
			})
		: [];

	const threats = piHoleReachable
		? detectDnsTunnelingLike(rows, hostnameToIpv4, { realLanByVpnIp, netmonitorByIp })
		: [];

	const alerts = buildSecurityAlerts({
		audit,
		audit_days: auditD,
		pi_hole_reachable: piHoleReachable,
		netmonitor_configured,
		netmonitor_reachable,
		anomalies,
		dns_threats: threats
	});

	return {
		window_hours: w,
		audit_days: auditD,
		pi_hole_reachable: piHoleReachable,
		netmonitor_configured,
		netmonitor_reachable,
		dns,
		audit,
		anomalies,
		threats,
		alerts
	};
}
