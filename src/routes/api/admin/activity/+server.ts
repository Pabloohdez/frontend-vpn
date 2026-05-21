import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listAudit } from '$lib/server/audit';

export const prerender = false;

/** Actividad reciente del panel (auditoría) para widgets y cron UI (PDF §4.1). */
export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30) || 30));
	const rows = await listAudit({ limit });
	return json({ items: rows, count: rows.length }, { headers: { 'cache-control': 'no-store' } });
};
