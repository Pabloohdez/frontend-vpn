import { describe, expect, it } from 'vitest';
import { analyzeDnsPatterns, dailyTotalsFromHourly } from '$lib/server/dns-patterns';
import type { DnsHourBucket } from '$lib/server/dns-hourly-store';

function hourAt(date: Date, total: number): DnsHourBucket {
	const t = Math.floor(date.getTime() / 1000);
	return { t, total, allowed: total, blocked: 0 };
}

describe('dns-patterns', () => {
	it('agrupa varias horas del mismo día', () => {
		const d = new Date(2026, 4, 20, 10, 0, 0);
		const hours = [hourAt(d, 100), hourAt(new Date(d.getTime() + 3600_000), 50)];
		const daily = dailyTotalsFromHourly(hours);
		expect(daily).toHaveLength(1);
		expect(daily[0].total).toBe(150);
	});

	it('ordena días de la semana y genera pronóstico', () => {
		const hours: DnsHourBucket[] = [];
		for (let i = 0; i < 21; i++) {
			const d = new Date(2026, 4, 1 + i, 12, 0, 0);
			hours.push(hourAt(d, 100 + (i % 7) * 20));
		}
		const report = analyzeDnsPatterns(hours);
		expect(report.weekdayStats).toHaveLength(7);
		expect(report.forecast).toHaveLength(7);
		expect(report.busiestDays.length).toBeGreaterThan(0);
	});
});
