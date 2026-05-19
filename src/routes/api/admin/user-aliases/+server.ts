import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { readAliases, writeAliases } from '$lib/server/user-aliases';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return json(readAliases(), { headers: { 'cache-control': 'no-store' } });
};

export const PUT: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const body = await request.json().catch(() => null);
	const cn = body?.cn;
	const alias = body?.alias;
	if (typeof cn !== 'string' || !cn.trim()) return json({ error: 'bad_request' }, { status: 400 });
	if (alias !== null && alias !== undefined && typeof alias !== 'string') {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const next = readAliases();
	if (typeof alias === 'string' && alias.trim()) {
		next[cn] = alias.trim();
	} else {
		delete next[cn];
	}
	writeAliases(next);
	return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
};

