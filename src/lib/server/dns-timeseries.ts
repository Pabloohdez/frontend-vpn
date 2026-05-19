import { isPiholeQueryBlockedStatus } from '$lib/server/security-insights';
import type { PiholeQueryTuple } from '$lib/server/pihole-query-log';

/** Punto de la serie temporal: total/permitidas/bloqueadas. */
export type DnsTimePoint = {
	t: number; // epoch seconds (inicio del bucket)
	label: string; // etiqueta legible (HH:00 o DD/MM)
	total: number;
	allowed: number;
	blocked: number;
};

export type DnsBucketGranularity = 'hour' | 'day';

/**
 * Agrupa filas Pi-hole en buckets de hora o día.
 */
export function bucketizeQueries(
	rows: PiholeQueryTuple[],
	fromEpoch: number,
	toEpoch: number,
	granularity: DnsBucketGranularity
): DnsTimePoint[] {
	const stepSec = granularity === 'hour' ? 3600 : 86400;
	const tzOffsetSec = new Date().getTimezoneOffset() * 60; // diff respecto UTC
	const align = (t: number) => {
		const local = t - tzOffsetSec;
		const start = local - (local % stepSec);
		return start + tzOffsetSec;
	};

	const first = align(fromEpoch);
	const last = align(toEpoch);
	const buckets = new Map<number, DnsTimePoint>();
	for (let t = first; t <= last; t += stepSec) {
		buckets.set(t, { t, label: formatLabel(t, granularity), total: 0, allowed: 0, blocked: 0 });
	}

	for (const row of rows) {
		const ts = Number(row[0] ?? 0);
		if (!ts) continue;
		const key = align(ts);
		const bucket = buckets.get(key);
		if (!bucket) continue;
		bucket.total += 1;
		if (isPiholeQueryBlockedStatus(Number(row[4] ?? 0))) bucket.blocked += 1;
		else bucket.allowed += 1;
	}

	return [...buckets.values()].sort((a, b) => a.t - b.t);
}

function formatLabel(epochSec: number, granularity: DnsBucketGranularity): string {
	const d = new Date(epochSec * 1000);
	if (granularity === 'hour') {
		return `${String(d.getHours()).padStart(2, '0')}:00`;
	}
	return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}
