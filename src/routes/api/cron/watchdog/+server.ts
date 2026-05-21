import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { fetchWithRetries } from '$lib/server/fetch-retry';
import { fetchVm1 } from '$lib/server/vm1';
import { assertPiholeConfigured, piholeApiToken } from '$lib/server/pihole';
import { piholeAdminApiUrl } from '$lib/server/pihole-list-fetch';
import { writeAudit } from '$lib/server/audit';
import { recordLastKnown } from '$lib/server/upstream-last-known';

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

/** Comprueba VM1 y Pi-hole; registra auditoría si fallan (PDF §4.1). */
export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!assertCronSecret(request)) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	const checks: Record<string, { ok: boolean; detail?: string }> = {};
	const remote = getClientAddress();

	const vpnBase = (env.VPN_API_BASE_URL ?? '').trim();
	if (vpnBase) {
		try {
			const r = await fetchWithRetries(`${vpnBase}/health`, undefined, { attempts: 2 });
			const body = { ok: r.ok, status: r.status };
			checks.vm1 = { ok: r.ok, detail: `HTTP ${r.status}` };
			if (r.ok) recordLastKnown('vpn_health', body);
			else {
				await writeAudit({
					ts: new Date().toISOString(),
					actor: 'cron',
					action: 'watchdog_vm1_down',
					success: false,
					remote_ip: remote,
					details: body
				});
			}
		} catch (e: unknown) {
			checks.vm1 = { ok: false, detail: String((e as Error)?.message ?? e) };
			await writeAudit({
				ts: new Date().toISOString(),
				actor: 'cron',
				action: 'watchdog_vm1_down',
				success: false,
				remote_ip: remote,
				details: { error: checks.vm1.detail }
			});
		}
	} else {
		checks.vm1 = { ok: false, detail: 'VPN_API_BASE_URL no configurado' };
	}

	const piholeCfg = assertPiholeConfigured();
	if (piholeCfg.ok) {
		try {
			const api = new URL(piholeAdminApiUrl());
			const token = piholeApiToken();
			if (token) api.searchParams.set('auth', token);
			api.searchParams.set('summaryRaw', '1');
			const r = await fetchWithRetries(api.toString(), { headers: { accept: 'application/json' } }, { attempts: 2 });
			const body = { ok: r.ok, status: r.status };
			checks.pihole = { ok: r.ok, detail: `HTTP ${r.status}` };
			if (r.ok) recordLastKnown('pihole_health', body);
			else {
				await writeAudit({
					ts: new Date().toISOString(),
					actor: 'cron',
					action: 'watchdog_pihole_down',
					success: false,
					remote_ip: remote,
					details: body
				});
			}
		} catch (e: unknown) {
			checks.pihole = { ok: false, detail: String((e as Error)?.message ?? e) };
			await writeAudit({
				ts: new Date().toISOString(),
				actor: 'cron',
				action: 'watchdog_pihole_down',
				success: false,
				remote_ip: remote,
				details: { error: checks.pihole.detail }
			});
		}
	} else {
		checks.pihole = { ok: false, detail: 'Pi-hole no configurado' };
	}

	const allOk = Object.values(checks).every((c) => c.ok);
	return json({ ok: allOk, checks, at: new Date().toISOString() }, { status: allOk ? 200 : 503 });
};
