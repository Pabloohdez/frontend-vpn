import { listAudit } from '$lib/server/audit';
import { enrichClientWithDevice, resolveClientIpv4 } from '$lib/server/device-resolve';
import type { NetmonitorIpMap } from '$lib/server/netmonitor';
import type { PiholeQueryTuple } from '$lib/server/pihole-query-log';

/** Heurística FTL/Pi-hole: bloqueo por lista o regex; 2/3 suelen ser permitidas (reenviadas/cache). */
export function isPiholeQueryBlockedStatus(st: number): boolean {
	const s = Math.floor(st);
	if (!Number.isFinite(s) || s <= 0) return false;
	if (s === 2 || s === 3) return false;
	if (s === 1 || s === 4 || s === 5) return true;
	if (s >= 9 && s <= 16) return true;
	return false;
}

function topCounts(map: Map<string, number>, k: number) {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, k)
		.map(([key, count]) => ({ key, count }));
}

export type DnsInsights = {
	total: number;
	blocked: number;
	blocked_ratio: number | null;
	block_estimate: 'ok' | 'unknown';
	top_domains: { domain: string; count: number }[];
	top_clients: {
		client: string;
		count: number;
		resolved_ip: string | null;
		lan_ip: string | null;
		device_label: string | null;
		device_type: string | null;
		sede_name: string | null;
	}[];
};

export function aggregateDnsInsights(
	rows: PiholeQueryTuple[],
	hostnameToIpv4: Record<string, string>,
	opts?: {
		realLanByVpnIp?: Record<string, string>;
		netmonitorByIp?: NetmonitorIpMap;
	}
): DnsInsights {
	const realLanByVpnIp = opts?.realLanByVpnIp ?? {};
	const netmonitorByIp = opts?.netmonitorByIp ?? {};
	const domainCount = new Map<string, number>();
	const clientCount = new Map<string, number>();
	let blocked = 0;
	for (const row of rows) {
		const domain = String(row[2] ?? '').trim();
		const client = String(row[3] ?? '').trim();
		const st = Number(row[4] ?? 0);
		if (domain) domainCount.set(domain, (domainCount.get(domain) ?? 0) + 1);
		if (client) clientCount.set(client, (clientCount.get(client) ?? 0) + 1);
		if (isPiholeQueryBlockedStatus(st)) blocked += 1;
	}
	const total = rows.length;
	const allZeroStatus = total > 0 && rows.every((r) => Number(r[4] ?? 0) === 0);

	const top_domains = topCounts(domainCount, 15).map(({ key, count }) => ({ domain: key, count }));
	const top_clients = topCounts(clientCount, 15).map(({ key, count }) => {
		const enriched = enrichClientWithDevice(key, hostnameToIpv4, realLanByVpnIp, netmonitorByIp);
		return {
			client: key,
			count,
			resolved_ip: enriched.resolved_ip ?? resolveClientIpv4(key, hostnameToIpv4),
			lan_ip: enriched.lan_ip,
			device_label: enriched.device_label,
			device_type: enriched.device_type,
			sede_name: enriched.sede_name
		};
	});

	return {
		total,
		blocked,
		blocked_ratio: total > 0 ? Math.round((1000 * blocked) / total) / 1000 : null,
		block_estimate: allZeroStatus ? 'unknown' : 'ok',
		top_domains,
		top_clients
	};
}

export type AuditInsights = {
	total_events: number;
	by_action: Record<string, number>;
	failed_logins: number;
};

export type SecurityAlert = {
	id: string;
	severity: 'warn' | 'critical';
	title: string;
	detail: string;
};

export type SecurityAlertInput = {
	audit: AuditInsights;
	audit_days: number;
	pi_hole_reachable: boolean;
	netmonitor_configured?: boolean;
	netmonitor_reachable?: boolean;
	failed_login_threshold?: number;
	anomalies?: DnsAnomaly[];
};

export type DnsAnomaly = {
	client: string;
	label: string | null;
	current: number;
	baseline_avg: number;
	multiplier: number;
	severity: 'warn' | 'critical';
};

export type AnomalyInput = {
	current_rows: PiholeQueryTuple[];
	baseline_rows: PiholeQueryTuple[];
	current_window_hours: number;
	baseline_window_hours: number;
	hostnameToIpv4: Record<string, string>;
	netmonitorByIp?: NetmonitorIpMap;
	realLanByVpnIp?: Record<string, string>;
	min_current?: number; // mínimo de consultas hoy para considerar (filtra ruido)
	threshold?: number; // múltiplo sobre baseline para considerar anomalía (default 3)
};

/**
 * Compara las consultas del periodo actual vs el promedio horario del periodo
 * baseline para detectar dispositivos con actividad inusualmente alta.
 *
 * Si el dispositivo no aparece en baseline, se incluye solo si supera el
 * mínimo `min_current` (default 500).
 */
export function detectDnsAnomalies(input: AnomalyInput): DnsAnomaly[] {
	const minCurrent = input.min_current ?? 250;
	const threshold = input.threshold ?? 3;
	const realLanByVpnIp = input.realLanByVpnIp ?? {};
	const netmonitorByIp = input.netmonitorByIp ?? {};

	const currentCount = new Map<string, number>();
	for (const row of input.current_rows) {
		const c = String(row[3] ?? '').trim();
		if (!c) continue;
		currentCount.set(c, (currentCount.get(c) ?? 0) + 1);
	}
	const baselineCount = new Map<string, number>();
	for (const row of input.baseline_rows) {
		const c = String(row[3] ?? '').trim();
		if (!c) continue;
		baselineCount.set(c, (baselineCount.get(c) ?? 0) + 1);
	}

	const currentH = Math.max(1, input.current_window_hours);
	const baselineH = Math.max(1, input.baseline_window_hours);

	const anomalies: DnsAnomaly[] = [];
	for (const [client, count] of currentCount) {
		const currentPerH = count / currentH;
		const basePerH = (baselineCount.get(client) ?? 0) / baselineH;
		const baselineEquivalent = basePerH * currentH; // qué esperaríamos en la ventana actual

		let multiplier = 0;
		let isAnomaly = false;
		if (basePerH > 0) {
			multiplier = currentPerH / basePerH;
			if (multiplier >= threshold && count >= 50) isAnomaly = true;
		} else if (count >= minCurrent) {
			multiplier = Infinity;
			isAnomaly = true;
		}
		if (!isAnomaly) continue;

		const enriched = enrichClientWithDevice(
			client,
			input.hostnameToIpv4,
			realLanByVpnIp,
			netmonitorByIp
		);
		anomalies.push({
			client,
			label: enriched.device_label ?? null,
			current: count,
			baseline_avg: Math.round(baselineEquivalent),
			multiplier: Number.isFinite(multiplier)
				? Math.round(multiplier * 10) / 10
				: Number.POSITIVE_INFINITY,
			severity:
				multiplier >= threshold * 3 || (basePerH === 0 && count >= minCurrent * 2)
					? 'critical'
					: 'warn'
		});
	}

	return anomalies
		.sort((a, b) => {
			const ma = Number.isFinite(a.multiplier) ? a.multiplier : 1e9;
			const mb = Number.isFinite(b.multiplier) ? b.multiplier : 1e9;
			return mb - ma;
		})
		.slice(0, 12);
}

/** Umbrales configurables vía env (ver .env.example). */
export function buildSecurityAlerts(input: SecurityAlertInput): SecurityAlert[] {
	const alerts: SecurityAlert[] = [];
	const raw =
		input.failed_login_threshold ??
		Number(process.env.SECURITY_ALERT_FAILED_LOGINS ?? 5);
	const thresh = Math.max(1, Math.floor(Number.isFinite(raw) ? raw : 5));

	if (input.audit.failed_logins >= thresh) {
		alerts.push({
			id: 'failed_logins',
			severity: input.audit.failed_logins >= thresh * 2 ? 'critical' : 'warn',
			title: 'Logins fallidos elevados',
			detail: `${input.audit.failed_logins} intentos fallidos en los últimos ${input.audit_days} días (umbral: ${thresh}). Revisa /audit.`
		});
	}

	if (!input.pi_hole_reachable) {
		alerts.push({
			id: 'pihole_unreachable',
			severity: 'critical',
			title: 'Pi-hole no disponible',
			detail:
				'No se obtuvieron consultas DNS en la ventana seleccionada. Comprueba PIHOLE_BASE_URL, token y conectividad desde VM2.'
		});
	}

	if (input.netmonitor_configured && input.netmonitor_reachable === false) {
		alerts.push({
			id: 'netmonitor_unreachable',
			severity: 'warn',
			title: 'Netmonitor no alcanzable',
			detail:
				'NETMONITOR_BASE_URL está configurado pero la API no respondió. Los dispositivos en DNS/Seguridad pueden mostrarse sin nombre.'
		});
	}

	if (input.anomalies && input.anomalies.length > 0) {
		const top = input.anomalies.slice(0, 3);
		const severity: 'warn' | 'critical' = top.some((a) => a.severity === 'critical')
			? 'critical'
			: 'warn';
		alerts.push({
			id: 'dns_anomaly',
			severity,
			title: `Actividad DNS inusual en ${input.anomalies.length} dispositivo(s)`,
			detail: top
				.map((a) => {
					const who = a.label ?? a.client;
					const mult = Number.isFinite(a.multiplier) ? `×${a.multiplier}` : 'nuevo';
					return `${who}: ${a.current.toLocaleString('es-ES')} consultas (${mult} sobre su media)`;
				})
				.join(' · ')
		});
	}

	return alerts;
}

export async function aggregateAuditInsights(auditDays: number): Promise<AuditInsights> {
	const from = new Date();
	from.setDate(from.getDate() - auditDays);
	const fromDay = from.toISOString().slice(0, 10);
	const toDay = new Date().toISOString().slice(0, 10);
	const auditRows = await listAudit({ limit: 12000, fromDay, toDay });
	const by_action: Record<string, number> = {};
	let failed_logins = 0;
	for (const r of auditRows) {
		const a = String(r.action ?? '');
		by_action[a] = (by_action[a] ?? 0) + 1;
		if (a === 'login' && !r.success) failed_logins += 1;
	}
	return {
		total_events: auditRows.length,
		by_action,
		failed_logins
	};
}
