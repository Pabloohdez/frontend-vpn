import type { DnsHourBucket } from '$lib/server/dns-hourly-store';

export type DailyDnsTotal = {
	/** YYYY-MM-DD en zona local del servidor. */
	date: string;
	t: number;
	total: number;
	allowed: number;
	blocked: number;
};

export type WeekdayStat = {
	dow: number;
	label: string;
	avgTotal: number;
	sampleDays: number;
};

export type ForecastDay = {
	date: string;
	t: number;
	predictedTotal: number;
	low: number;
	high: number;
	dow: number;
	dowLabel: string;
};

export type DnsPatternReport = {
	daysOfHistory: number;
	hourBuckets: number;
	daily: DailyDnsTotal[];
	weekdayStats: WeekdayStat[];
	busiestDays: DailyDnsTotal[];
	quietestDays: DailyDnsTotal[];
	forecast: ForecastDay[];
	trendPct: number | null;
	insight: string;
};

const DOW_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function localDateKey(epochSec: number): string {
	const d = new Date(epochSec * 1000);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

function localDow(epochSec: number): number {
	return new Date(epochSec * 1000).getDay();
}

/** Agrupa buckets horarios en totales por día natural (local). */
export function dailyTotalsFromHourly(hours: DnsHourBucket[]): DailyDnsTotal[] {
	const map = new Map<string, DailyDnsTotal>();
	for (const h of hours) {
		const date = localDateKey(h.t);
		const cur = map.get(date) ?? {
			date,
			t: h.t,
			total: 0,
			allowed: 0,
			blocked: 0
		};
		cur.total += h.total;
		cur.allowed += h.allowed;
		cur.blocked += h.blocked;
		map.set(date, cur);
	}
	return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function weekdayAverages(daily: DailyDnsTotal[]): WeekdayStat[] {
	const sums = new Map<number, { total: number; days: number }>();
	for (const d of daily) {
		const dow = localDow(d.t);
		const s = sums.get(dow) ?? { total: 0, days: 0 };
		s.total += d.total;
		s.days += 1;
		sums.set(dow, s);
	}
	const stats: WeekdayStat[] = [];
	for (let dow = 0; dow < 7; dow++) {
		const s = sums.get(dow);
		stats.push({
			dow,
			label: DOW_LABELS[dow],
			avgTotal: s && s.days > 0 ? Math.round(s.total / s.days) : 0,
			sampleDays: s?.days ?? 0
		});
	}
	return stats.sort((a, b) => b.avgTotal - a.avgTotal);
}

function linearTrendSlope(daily: DailyDnsTotal[]): number {
	if (daily.length < 3) return 0;
	const n = daily.length;
	let sumX = 0;
	let sumY = 0;
	let sumXY = 0;
	let sumXX = 0;
	for (let i = 0; i < n; i++) {
		sumX += i;
		sumY += daily[i].total;
		sumXY += i * daily[i].total;
		sumXX += i * i;
	}
	const denom = n * sumXX - sumX * sumX;
	if (denom === 0) return 0;
	return (n * sumXY - sumX * sumY) / denom;
}

function forecastDays(daily: DailyDnsTotal[], weekday: WeekdayStat[], daysAhead = 7): ForecastDay[] {
	const slope = linearTrendSlope(daily.slice(-14));
	const byDow = new Map(weekday.map((w) => [w.dow, w]));
	const dailyByDow = new Map<number, number[]>();
	for (const d of daily) {
		const dow = localDow(d.t);
		const arr = dailyByDow.get(dow) ?? [];
		arr.push(d.total);
		dailyByDow.set(dow, arr);
	}

	const out: ForecastDay[] = [];
	const last = daily.length ? daily[daily.length - 1] : null;
	const baseT = last ? last.t : Math.floor(Date.now() / 1000);
	for (let i = 1; i <= daysAhead; i++) {
		const t = baseT + i * 86400;
		const dow = localDow(t);
		const w = byDow.get(dow);
		const hist = dailyByDow.get(dow) ?? [];
		const low = hist.length ? Math.min(...hist) : 0;
		const high = hist.length ? Math.max(...hist) : 0;
		const base = w?.avgTotal ?? 0;
		const predicted = Math.max(0, Math.round(base + slope * (daily.length + i - daily.length)));
		out.push({
			date: localDateKey(t),
			t,
			predictedTotal: predicted,
			low,
			high,
			dow,
			dowLabel: DOW_LABELS[dow]
		});
	}
	return out;
}

function trendPercent(daily: DailyDnsTotal[]): number | null {
	if (daily.length < 14) return null;
	const last7 = daily.slice(-7);
	const prev7 = daily.slice(-14, -7);
	const a = last7.reduce((s, d) => s + d.total, 0);
	const b = prev7.reduce((s, d) => s + d.total, 0);
	if (b <= 0) return a > 0 ? 100 : 0;
	return Math.round(((a - b) / b) * 1000) / 10;
}

function buildInsight(weekday: WeekdayStat[], trend: number | null, days: number): string {
	if (days < 3) {
		return 'Aún hay pocos datos guardados; el histórico se rellena cada hora desde Pi-hole.';
	}
	const top = weekday.filter((w) => w.sampleDays > 0).slice(0, 2);
	const bottom = [...weekday].filter((w) => w.sampleDays > 0).reverse().slice(0, 2);
	let s = '';
	if (top.length >= 2) {
		s = `Suele haber más consultas los ${top[0].label} y ${top[1].label}; menos los ${bottom[0].label}.`;
	}
	if (trend !== null) {
		s += ` Últimos 7 días vs los 7 anteriores: ${trend >= 0 ? '+' : ''}${trend} %.`;
	}
	return s.trim();
}

export function analyzeDnsPatterns(hours: DnsHourBucket[]): DnsPatternReport {
	const daily = dailyTotalsFromHourly(hours);
	const weekdayStats = weekdayAverages(daily);
	const sorted = [...daily].sort((a, b) => b.total - a.total);
	const busiestDays = sorted.filter((d) => d.total > 0).slice(0, 5);
	const quietestDays = [...daily]
		.filter((d) => d.total > 0)
		.sort((a, b) => a.total - b.total)
		.slice(0, 5);
	const uniqueDates = new Set(daily.map((d) => d.date));
	const trendPct = trendPercent(daily);

	return {
		daysOfHistory: uniqueDates.size,
		hourBuckets: hours.length,
		daily,
		weekdayStats,
		busiestDays,
		quietestDays,
		forecast: forecastDays(daily, weekdayStats, 7),
		trendPct,
		insight: buildInsight(weekdayStats, trendPct, uniqueDates.size)
	};
}
