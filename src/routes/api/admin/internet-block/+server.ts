import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoleFromRequestCookie, requirePermissionFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { blockInternetForIp, unblockInternetForIp } from '$lib/server/pihole-internet-block';
import { resolveInternetBlockIp } from '$lib/server/pihole-client-resolve';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeCriticalAudit } from '$lib/server/audit-signed';

export const prerender = false;

type Body = {
	ip?: string;
	/** Cliente tal como lo registró Pi-hole en la consulta DNS (nombre, IP, etc.). */
	client?: string;
	op?: 'block' | 'unblock';
	label?: string;
	cn?: string;
};

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'internet_block_write');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const rl = rateLimitKey('admin:internet_block_write', getClientAddress(), { windowMs: 60_000, maxPerWindow: 15 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const body = (await request.json().catch(() => null)) as Body | null;
	const op = body?.op === 'unblock' ? 'unblock' : body?.op === 'block' ? 'block' : null;
	if (!op) {
		return json({ error: 'bad_request', message: 'op (block|unblock) requerido' }, { status: 400 });
	}

	const role = getRoleFromRequestCookie(request.headers.get('cookie')) ?? authz.role;
	const labelParts = [body?.label?.trim(), body?.cn?.trim() ? `CN ${body.cn.trim()}` : ''].filter(Boolean);
	const label = labelParts.length ? labelParts.join(' · ') : null;
	const clientRaw = String(body?.client ?? '').trim();

	let ip = String(body?.ip ?? '').trim();
	let resolveSource: string | undefined;
	if (op === 'block' && !ip && clientRaw) {
		const resolved = await resolveInternetBlockIp(fetch, { ip, clientRaw });
		ip = resolved.ip ?? '';
		resolveSource = resolved.source;
		if (!ip) {
			return json(
				{ ok: false, ip: '', message: resolved.message ?? 'No se pudo resolver la IP del cliente' },
				{ status: 400, headers: { 'cache-control': 'no-store' } }
			);
		}
	}

	if (!ip) {
		return json({ error: 'bad_request', message: 'ip o client requerido' }, { status: 400 });
	}

	const result =
		op === 'block'
			? await blockInternetForIp(fetch, ip, { label, actor: role, clientRaw: clientRaw || null })
			: await unblockInternetForIp(fetch, ip);

	try {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: role,
			action: op === 'block' ? 'internet_block' : 'internet_unblock',
			target_cn: body?.cn?.trim() || undefined,
			success: result.ok,
			remote_ip: getClientAddress(),
			details: { ip, message: result.message, label, client: clientRaw || null, resolve_source: resolveSource ?? null }
		});
	} catch {
		/* best-effort */
	}
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: role,
			action: op === 'block' ? 'internet_block' : 'internet_unblock',
			success: result.ok,
			remote_ip: getClientAddress(),
			details: { ip, message: result.message, label, client: clientRaw || null, resolve_source: resolveSource ?? null }
		});
	} catch {
		/* best-effort */
	}

	return json(result, {
		status: result.ok ? 200 : 502,
		headers: { 'cache-control': 'no-store' }
	});
};
