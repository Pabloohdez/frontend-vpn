import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { assertVm1Configured, fetchVm1, vm1ApiKey, vm1BaseUrl } from '$lib/server/vm1';

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertVm1Configured();
	if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });

	const body = await request.json().catch(() => null);
	const cn = body?.cn;
	const reason = body?.reason;
	if (typeof cn !== 'string' || cn.length < 1) return json({ error: 'bad_request' }, { status: 400 });

	const upstream = await fetchVm1(`${vm1BaseUrl()}/api/v1/admin/kick`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'X-API-Key': vm1ApiKey() },
		body: JSON.stringify({ cn, reason })
	});

	const ok = upstream.ok;
	const payload = await upstream.json().catch(() => ({}));

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'kick',
		target_cn: cn,
		success: ok,
		remote_ip: getClientAddress(),
		details: { upstream_status: upstream.status, payload }
	});

	return json(payload, { status: ok ? 200 : 502, headers: { 'cache-control': 'no-store' } });
};

