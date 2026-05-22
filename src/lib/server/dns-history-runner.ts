import { alignHourEpoch, bucketizeQueries } from '$lib/server/dns-timeseries';
import {
	hasDnsHourBucket,
	missingHourStarts,
	upsertDnsHourBucket
} from '$lib/server/dns-hourly-store';
import { fetchPiholeQueryLog } from '$lib/server/pihole-query-log';

let lastTickAt = 0;

/**
 * Rellena buckets horarios cerrados desde Pi-hole (throttle ~60s).
 * Cada tick procesa como máximo `maxPerTick` horas faltantes.
 */
export async function tickDnsHourlyHistory(
	fetchFn: typeof fetch,
	opts?: { maxPerTick?: number; force?: boolean }
): Promise<{ filled: number; skipped: boolean }> {
	const maxPerTick = opts?.maxPerTick ?? 3;
	const nowMs = Date.now();
	if (!opts?.force && nowMs - lastTickAt < 60_000) {
		return { filled: 0, skipped: true };
	}
	lastTickAt = nowMs;

	const now = Math.floor(nowMs / 1000);
	const lastClosed = alignHourEpoch(now) - 3600;
	const missing = missingHourStarts(lastClosed, maxPerTick);
	let filled = 0;

	for (const hourStart of missing) {
		if (hasDnsHourBucket(hourStart)) continue;
		const { rows, piHoleReachable } = await fetchPiholeQueryLog(
			fetchFn,
			hourStart,
			hourStart + 3600
		);
		if (!piHoleReachable) break;

		const pts = bucketizeQueries(rows, hourStart, hourStart + 3599, 'hour');
		const pt = pts.find((p) => p.t === hourStart) ?? {
			t: hourStart,
			label: '',
			total: 0,
			allowed: 0,
			blocked: 0
		};
		upsertDnsHourBucket({
			t: pt.t,
			total: pt.total,
			allowed: pt.allowed,
			blocked: pt.blocked
		});
		filled += 1;
	}

	return { filled, skipped: false };
}
