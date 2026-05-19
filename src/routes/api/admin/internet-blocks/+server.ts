import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { listInternetBlocks } from '$lib/server/internet-blocks-store';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return json(
		{ blocks: listInternetBlocks() },
		{ headers: { 'cache-control': 'no-store' } }
	);
};
