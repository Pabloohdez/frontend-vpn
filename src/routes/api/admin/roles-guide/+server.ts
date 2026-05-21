import type { RequestHandler } from './$types';
import { buildRolesGuideMarkdown } from '$lib/server/roles-guide';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read').ok) {
		return new Response(JSON.stringify({ error: 'unauthorized' }), {
			status: 401,
			headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
		});
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
