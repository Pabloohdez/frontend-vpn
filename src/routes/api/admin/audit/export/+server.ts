import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listAudit } from '$lib/server/audit';

export const prerender = false;

function csvEscape(v: string) {
	if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
	return v;
}

/** Export CSV de auditoría (PDF §4.2). */
export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return new Response('unauthorized', { status: 401 });
	}

	const limit = Math.min(5000, Math.max(1, Number(url.searchParams.get('limit') ?? 2000) || 2000));
	const rows = await listAudit({
		limit,
		fromDay: url.searchParams.get('from') ?? undefined,
		toDay: url.searchParams.get('to') ?? undefined,
		action: url.searchParams.get('action') ?? undefined,
		cn: url.searchParams.get('cn') ?? undefined,
		success:
			url.searchParams.get('success') === 'true'
				? true
				: url.searchParams.get('success') === 'false'
					? false
					: undefined
	});

	const header = ['ts', 'actor', 'action', 'target_cn', 'success', 'remote_ip', 'details'];
	const lines = [
		header.join(','),
		...rows.map((r) =>
			[
				csvEscape(r.ts),
				csvEscape(r.actor),
				csvEscape(r.action),
				csvEscape(r.target_cn ?? ''),
				r.success ? 'true' : 'false',
				csvEscape(r.remote_ip ?? ''),
				csvEscape(r.details ? JSON.stringify(r.details) : '')
			].join(',')
		)
	];

	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(lines.join('\n') + '\n', {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="audit-${stamp}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
