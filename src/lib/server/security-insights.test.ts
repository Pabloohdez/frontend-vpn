import { describe, expect, it } from 'vitest';
import {
	aggregateDnsInsights,
	buildSecurityAlerts,
	isPiholeQueryBlockedStatus,
	type AuditInsights
} from './security-insights';
import type { PiholeQueryTuple } from './pihole-query-log';

describe('isPiholeQueryBlockedStatus', () => {
	it('trata estados bloqueados y permitidos', () => {
		expect(isPiholeQueryBlockedStatus(1)).toBe(true);
		expect(isPiholeQueryBlockedStatus(2)).toBe(false);
		expect(isPiholeQueryBlockedStatus(0)).toBe(false);
	});
});

describe('aggregateDnsInsights', () => {
	it('cuenta dominios y bloqueos', () => {
		const rows: PiholeQueryTuple[] = [
			[1, 'A', 'ads.example.com', '10.0.0.1', 1],
			[2, 'A', 'ok.example.com', '10.0.0.1', 2],
			[3, 'A', 'ads.example.com', '10.0.0.2', 1]
		];
		const r = aggregateDnsInsights(rows, {});
		expect(r.total).toBe(3);
		expect(r.blocked).toBe(2);
		expect(r.top_domains[0]?.domain).toBe('ads.example.com');
	});
});

describe('buildSecurityAlerts', () => {
	const baseAudit: AuditInsights = {
		total_events: 10,
		by_action: { login: 10 },
		failed_logins: 0
	};

	it('alerta si hay muchos logins fallidos', () => {
		const alerts = buildSecurityAlerts({
			audit: { ...baseAudit, failed_logins: 8 },
			audit_days: 7,
			pi_hole_reachable: true,
			failed_login_threshold: 5
		});
		expect(alerts.some((a) => a.id === 'failed_logins')).toBe(true);
	});

	it('alerta si Pi-hole no responde', () => {
		const alerts = buildSecurityAlerts({
			audit: baseAudit,
			audit_days: 7,
			pi_hole_reachable: false
		});
		expect(alerts.some((a) => a.id === 'pihole_unreachable')).toBe(true);
	});

	it('sin alertas en estado sano', () => {
		const alerts = buildSecurityAlerts({
			audit: baseAudit,
			audit_days: 7,
			pi_hole_reachable: true,
			netmonitor_configured: true,
			netmonitor_reachable: true,
			failed_login_threshold: 5
		});
		expect(alerts).toHaveLength(0);
	});
});
