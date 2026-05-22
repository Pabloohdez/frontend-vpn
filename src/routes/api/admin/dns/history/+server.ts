import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listDnsHourlyBuckets } from '$lib/server/dns-hourly-store';
import { analyzeDnsPatterns } from '$lib/server/dns-patterns';
import { tickDnsHourlyHistory } from '$lib/server/dns-history-runner';
import { alignHourEpoch } from '$lib/server/dns-timeseries';

export const prerender = false;

export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	await tickDnsHourlyHistory(fetch, { maxPerTick: 6, force: true });

	const daysRaw = Number(url.searchParams.get('days') ?? 90);
	const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(7, Math.floor(daysRaw))) : 90;
	const now = Math.floor(Date.now() / 1000);
	const from = alignHourEpoch(now) - days * 86400;

	const hours = listDnsHourlyBuckets().filter((h) => h.t >= from);
	const patterns = analyzeDnsPatterns(hours);

	return json(
		{
			days,
			from,
			now,
			hours,
			patterns
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
