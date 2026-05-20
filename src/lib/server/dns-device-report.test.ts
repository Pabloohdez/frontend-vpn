import { describe, expect, it } from 'vitest';
import { buildDnsDeviceReport, dayBoundsLocal } from './dns-device-report';
import type { PiholeQueryTuple } from './pihole-query-log';

describe('buildDnsDeviceReport', () => {
	it('agrupa consultas por dispositivo en un día', () => {
		const bounds = dayBoundsLocal('2026-05-19');
		expect(bounds).not.toBeNull();
		const from = bounds!.from;
		const rows: PiholeQueryTuple[] = [
			[from + 3600, 'A', 'example.com', '203.0.113.16', 2],
			[from + 7200, 'A', 'blocked.com', '203.0.113.16', 4],
			[from + 4000, 'A', 'other.net', '192.0.2.50', 2]
		];
		const report = buildDnsDeviceReport({
			rows,
			day: '2026-05-19',
			hostnameToIpv4: {},
			netmonitorByIp: {},
			maxQueriesPerDevice: 100
		});
		expect(report.devices.length).toBe(2);
		const vpn = report.devices.find((d) => d.client_pihole === '203.0.113.16');
		expect(vpn?.total).toBe(2);
		expect(vpn?.top_domains.some((t) => t.domain === 'example.com')).toBe(true);
	});
});
