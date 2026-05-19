import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { addHiddenRevoked, readHiddenRevoked, removeHiddenRevoked } from '$lib/server/revoked-hidden';
import { writeAudit } from '$lib/server/audit';

export const prerender = false;

function isValidCn(cn: string) {
	return /^[a-zA-Z0-9.@_-]+$/.test(cn) && !cn.startsWith('.') && !cn.startsWith('-') && cn.length <= 64;
}

export const GET: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return json({ hidden: readHiddenRevoked() }, { headers: { 'cache-control': 'no-store' } });
};

export const PUT: RequestHandler = async ({ request, getClientAddress }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const cn = body?.cn;
	if (typeof cn !== 'string' || !cn.trim()) return json({ error: 'bad_request' }, { status: 400 });
	const trimmed = cn.trim();
	if (!isValidCn(trimmed)) return json({ error: 'bad_request' }, { status: 400 });

	addHiddenRevoked(trimmed);

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'hide_revoked_user',
		target_cn: trimmed,
		success: true,
		remote_ip: getClientAddress()
	});

	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};

export const DELETE: RequestHandler = async ({ request, getClientAddress }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const cn = body?.cn;
	if (typeof cn !== 'string' || !cn.trim()) return json({ error: 'bad_request' }, { status: 400 });
	const trimmed = cn.trim();
	if (!isValidCn(trimmed)) return json({ error: 'bad_request' }, { status: 400 });

	removeHiddenRevoked(trimmed);

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'unhide_revoked_user',
		target_cn: trimmed,
		success: true,
		remote_ip: getClientAddress()
	});

	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};
