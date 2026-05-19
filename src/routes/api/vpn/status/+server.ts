import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie, isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { fetchVm1 } from '$lib/server/vm1';
import { log } from '$lib/server/log';
import { updateIpCnHistoryFromStatus } from '$lib/server/vpn-ipcn-history';

export const prerender = false;

function maskIp(ip: string) {
	// Requisito UI: mostrar asteriscos y revelar solo al click (admin)
	void ip;
	return '***';
}

export const GET: RequestHandler = async ({ fetch, request, url, getClientAddress }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
	}

	const baseUrl = env.VPN_API_BASE_URL;
	const apiKey = env.VPN_API_KEY;

	if (!baseUrl || !apiKey) {
		return json(
			{
				error: 'misconfigured',
				message: 'Faltan VPN_API_BASE_URL y/o VPN_API_KEY en el .env del contenedor'
			},
			{ status: 500, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	const isAdmin = isAdminFromRequestCookie(request.headers.get('cookie'));
	const revealCn = url.searchParams.get('reveal_cn');
	const canRevealOne = Boolean(isAdmin && revealCn);

	const upstream = await fetchVm1(`${baseUrl}/api/v1/status`, {
		headers: { 'X-API-Key': apiKey }
	});

	if (!upstream.ok) {
		const errBody = await upstream.clone().json().catch(() => null);
		if (
			errBody &&
			typeof errBody === 'object' &&
			(errBody as { error?: string }).error === 'upstream_unreachable'
		) {
			log.warn('vpn_status_unreachable', errBody);
			return json(errBody, { status: 502, headers: { 'Cache-Control': 'no-store' } });
		}
		log.warn('vpn_status_upstream_http', { status: upstream.status });
		return json(
			{ error: 'upstream_error', status: upstream.status },
			{ status: 502, headers: { 'Cache-Control': 'no-store' } }
		);
	}

	const data = await upstream.json();

	// Aprendemos IP virtual -> CN y LAN **antes** de enmascarar respuestas al cliente.
	if (data?.connected_clients && Array.isArray(data.connected_clients)) {
		try {
			updateIpCnHistoryFromStatus(data.connected_clients);
		} catch {
			// best-effort
		}
	}

	// Normalizar/enmascarar IP por defecto
	if (data?.connected_clients && Array.isArray(data.connected_clients)) {
		data.connected_clients = data.connected_clients.map((c: any) => {
			if (!c) return c;

			// Identificador: algunas versiones usan common_name
			const cn = typeof c.cn === 'string' ? c.cn : typeof c.common_name === 'string' ? c.common_name : '';
			const shouldRevealThis = canRevealOne && typeof revealCn === 'string' && cn === revealCn;

			// Fuente real de IP: preferir real_ip
			const realIp = typeof c.real_ip === 'string' ? c.real_ip : null;
			const existing = typeof c.real_address === 'string' ? c.real_address : null;

			let real_address: string;
			if (realIp) {
				real_address = shouldRevealThis ? realIp : maskIp(realIp);
			} else if (existing) {
				real_address = shouldRevealThis ? existing : maskIp(existing);
			} else {
				real_address = '***';
			}

			return { ...c, cn, real_address };
		});
	}

	if (revealCn && !isAdmin) {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'view_ip',
			success: false,
			remote_ip: getClientAddress(),
			details: { reason: 'not_admin', cn: revealCn }
		});
	}

	if (canRevealOne) {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'view_ip',
			success: true,
			remote_ip: getClientAddress(),
			target_cn: typeof revealCn === 'string' ? revealCn : undefined,
			details: { scope: 'status_reveal_one' }
		});
	}

	return json(data, { headers: { 'Cache-Control': 'no-store' } });
};

