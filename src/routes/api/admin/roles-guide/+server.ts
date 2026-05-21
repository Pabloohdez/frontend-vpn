import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { buildRolesGuideMarkdown } from '$lib/server/roles-guide';
import { renderRolesGuidePdf } from '$lib/server/roles-guide-pdf';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { rateLimitKey } from '$lib/server/rate-limit';

export const prerender = false;

export const GET: RequestHandler = async ({ request, url, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	const format = (url.searchParams.get('format') ?? 'md').trim().toLowerCase();

	const rl = rateLimitKey('admin:roles_guide', getClientAddress(), {
		windowMs: 60_000,
		maxPerWindow: format === 'pdf' ? 8 : 15
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	if (format === 'pdf') {
		try {
			const buf = await renderRolesGuidePdf();
			return new Response(new Uint8Array(buf), {
				headers: {
					'content-type': 'application/pdf',
					'content-disposition': 'attachment; filename="roles-panel-vpn.pdf"',
					'cache-control': 'no-store'
				}
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Error al generar PDF';
			return json({ error: 'server_error', message: msg }, { status: 500 });
		}
	}

	const md = buildRolesGuideMarkdown();
	return new Response(md, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': 'attachment; filename="roles-panel-vpn.md"',
			'cache-control': 'no-store'
		}
	});
};
