import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isStaffFromRequestCookie } from '$lib/server/auth';
import { getLastKnown } from '$lib/server/upstream-last-known';
import { listAudit } from '$lib/server/audit';
import { env } from '$env/dynamic/private';
import { getEnvSecurityWarnings } from '$lib/server/env-security';

export const prerender = false;

/** Vista unificada: VPN, Pi-hole, alertas recientes (PDF §4.4). */
export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isStaffFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const origin = url.origin;
	const cookie = request.headers.get('cookie') ?? '';

	const [vpnH, piholeH, vpnS, auditRes, secRes] = await Promise.all([
		fetch(`${origin}/api/vpn/health`, { headers: { cookie, 'cache-control': 'no-cache' } }).catch(
			() => null
		),
		fetch(`${origin}/api/pihole/health`, { headers: { cookie, 'cache-control': 'no-cache' } }).catch(
			() => null
		),
		fetch(`${origin}/api/vpn/status`, { headers: { cookie, 'cache-control': 'no-cache' } }).catch(
			() => null
		),
		Promise.resolve(null),
		fetch(`${origin}/api/admin/security-insights?window_hours=24`, {
			headers: { cookie, 'cache-control': 'no-cache' }
		}).catch(() => null)
	]);

	const vpn_health = vpnH?.ok ? await vpnH.json().catch(() => null) : { ok: false, stale: true };
	const pihole_health = piholeH?.ok ? await piholeH.json().catch(() => null) : { ok: false, stale: true };
	const vpn_status = vpnS?.ok ? await vpnS.json().catch(() => null) : null;

	let security: { alerts?: unknown[] } | null = null;
	if (secRes?.ok) security = await secRes.json().catch(() => null);

	const recent_audit = await listAudit({ limit: 8 }).catch(() => []);

	const configured = {
		vpn: Boolean(env.VPN_API_BASE_URL?.trim() && env.VPN_API_KEY?.trim()),
		pihole: Boolean(env.PIHOLE_BASE_URL?.trim())
	};

	return json(
		{
			configured,
			vpn_health,
			pihole_health,
			vpn_status,
			vpn_status_stale: Boolean((vpn_status as { stale?: boolean })?.stale),
			last_known: {
				vpn_health: getLastKnown('vpn_health'),
				pihole_health: getLastKnown('pihole_health'),
				vpn_status: getLastKnown('vpn_status')
			},
			security_alert_count: Array.isArray(security?.alerts) ? security.alerts.length : 0,
			security_alerts_preview: Array.isArray(security?.alerts) ? security.alerts.slice(0, 5) : [],
			recent_audit,
			env_warnings: getEnvSecurityWarnings(),
			generated_at: new Date().toISOString()
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
