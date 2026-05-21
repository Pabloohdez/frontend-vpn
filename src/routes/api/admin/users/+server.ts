import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { writeCriticalAudit } from '$lib/server/audit-signed';
import { assertVm1Configured, fetchVm1, vm1ApiKey, vm1BaseUrl } from '$lib/server/vm1';

export const GET: RequestHandler = async ({ request, fetch }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'vpn_read').ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertVm1Configured();
	if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });

	const upstream = await fetchVm1(`${vm1BaseUrl()}/api/v1/users`, {
		headers: { 'X-Admin-Key': vm1ApiKey() }
	});

	const payload = await upstream.json().catch(() => ([] as unknown[]));
	return json(payload, { status: upstream.ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
};

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'vpn_write').ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertVm1Configured();
	if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });

	const body = await request.json().catch(() => null);
	const cn = body?.cn;
	const days_valid = body?.days_valid;
	if (typeof cn !== 'string' || cn.length < 1) return json({ error: 'bad_request' }, { status: 400 });

	// VM1 contract:
	// POST /api/v1/users { name, password, days } with header X-Admin-Key
	const upstream = await fetchVm1(`${vm1BaseUrl()}/api/v1/users`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'X-Admin-Key': vm1ApiKey() },
		body: JSON.stringify({ name: cn, password: null, days: days_valid })
	});

	const ok = upstream.ok;
	const payload = await upstream.json().catch(() => ({}));
	const upstreamStatus = upstream.status;

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'create_user',
		target_cn: cn,
		success: ok,
		remote_ip: getClientAddress(),
		details: { upstream_status: upstreamStatus, payload }
	});
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'create_user',
			target_cn: cn,
			success: ok,
			remote_ip: getClientAddress(),
			details: { upstream_status: upstreamStatus }
		});
	} catch {
		/* best-effort */
	}

	if (ok) {
		return json(payload, { status: 200, headers: { 'cache-control': 'no-store' } });
	}

	// Dar más contexto al cliente (sin filtrar API keys; esto solo refleja el status/payload de VM1)
	const hint =
		upstreamStatus === 404
			? 'VM1 no expone /api/v1/users (endpoint no implementado o base URL incorrecta)'
			: undefined;

	return json(
		{ error: 'upstream_error', upstream_status: upstreamStatus, hint, payload },
		{ status: 502, headers: { 'cache-control': 'no-store' } }
	);
};

export const DELETE: RequestHandler = async ({ request, fetch, url, getClientAddress }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'vpn_write').ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertVm1Configured();
	if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });

	const cn = url.searchParams.get('cn');
	if (!cn) return json({ error: 'bad_request' }, { status: 400 });

	// VM1 contract:
	// DELETE /api/v1/users/{name} with header X-Admin-Key
	const upstream = await fetchVm1(`${vm1BaseUrl()}/api/v1/users/${encodeURIComponent(cn)}`, {
		method: 'DELETE',
		headers: { 'X-Admin-Key': vm1ApiKey() }
	});

	const ok = upstream.ok;
	const payload = await upstream.json().catch(() => ({}));

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'revoke_user',
		target_cn: cn,
		success: ok,
		remote_ip: getClientAddress(),
		details: { upstream_status: upstream.status, payload }
	});
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'revoke_user',
			target_cn: cn,
			success: ok,
			remote_ip: getClientAddress(),
			details: { upstream_status: upstream.status }
		});
	} catch {
		/* best-effort */
	}

	return json(payload, { status: ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
};

