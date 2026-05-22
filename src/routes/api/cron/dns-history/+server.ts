import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { tickDnsHourlyHistory } from '$lib/server/dns-history-runner';
import { countDnsHourlyBuckets } from '$lib/server/dns-hourly-store';
import type { RequestHandler } from './$types';

export const prerender = false;

function assertCronSecret(request: Request): boolean {
	const expected = (env.CRON_SECRET ?? '').trim();
	if (!expected) return false;
	const got =
		request.headers.get('x-cron-secret')?.trim() ||
		new URL(request.url).searchParams.get('secret')?.trim() ||
		'';
	return got.length > 0 && timingSafeEqualString(got, expected);
}

/** Snapshot horario DNS (rellena huecos). Ejecutar cada hora vía cron. */
export const POST: RequestHandler = async ({ request, fetch, url }) => {
	if (!assertCronSecret(request)) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const maxRaw = Number(url.searchParams.get('max_hours') ?? 24);
	const maxPerTick = Number.isFinite(maxRaw) ? Math.min(168, Math.max(1, Math.floor(maxRaw))) : 24;

	const { filled, skipped } = await tickDnsHourlyHistory(fetch, {
		maxPerTick,
		force: true
	});

	return json({
		ok: true,
		filled,
		skipped,
		stored_hours: countDnsHourlyBuckets(),
		at: new Date().toISOString()
	});
};
