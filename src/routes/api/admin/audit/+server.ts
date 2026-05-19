import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listAudit } from '$lib/server/audit';

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const limitRaw = Number(url.searchParams.get('limit') ?? '200');
	const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;
	const fromDay = url.searchParams.get('from') ?? undefined; // YYYY-MM-DD
	const toDay = url.searchParams.get('to') ?? undefined; // YYYY-MM-DD
	const action = url.searchParams.get('action') ?? undefined;
	const cn = url.searchParams.get('cn') ?? undefined;
	const ok = url.searchParams.get('ok');
	const success = ok === null ? undefined : ok === '1';

	const rows = await listAudit({ limit, fromDay, toDay, action, cn, success });
	return json(rows, { headers: { 'cache-control': 'no-store' } });
};

