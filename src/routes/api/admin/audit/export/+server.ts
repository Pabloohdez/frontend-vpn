import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listAudit } from '$lib/server/audit';
import { buildSpreadsheetXml, isSpreadsheetFormat, spreadsheetExtension } from '$lib/spreadsheet-export';

export const prerender = false;

function csvEscape(v: string) {
	if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
	return v;
}

/** Export CSV o Excel de auditoría (PDF §4.2). `?format=xls` para Excel. */
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
	const stamp = new Date().toISOString().slice(0, 10);
	const format = (url.searchParams.get('format') ?? 'csv').trim().toLowerCase();

	if (isSpreadsheetFormat(format)) {
		const ext = spreadsheetExtension(format);
		const dataRows = rows.map((r) => [
			r.ts,
			r.actor,
			r.action,
			r.target_cn ?? '',
			r.success ? 'true' : 'false',
			r.remote_ip ?? '',
			r.details ? JSON.stringify(r.details) : ''
		]);
		const xml = buildSpreadsheetXml('Auditoría', header, dataRows);
		return new Response(xml, {
			status: 200,
			headers: {
				'content-type': 'application/vnd.ms-excel; charset=utf-8',
				'content-disposition': `attachment; filename="audit-${stamp}.${ext}"`,
				'cache-control': 'no-store'
			}
		});
	}

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

	return new Response('\uFEFF' + lines.join('\n') + '\n', {
		status: 200,
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="audit-${stamp}.csv"`,
			'cache-control': 'no-store'
		}
	});
};
