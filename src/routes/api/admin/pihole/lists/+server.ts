import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { fetchAllPiholeLists } from '$lib/server/pihole-list-fetch';

export const prerender = false;

export const GET: RequestHandler = async ({ request, fetch }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json(
			{ error: 'misconfigured', message: 'Falta PIHOLE_BASE_URL en el .env' },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}

	const { blocked, allowed, errors } = await fetchAllPiholeLists(fetch);
	const total = blocked.exact.length + blocked.wildcard.length + allowed.exact.length + allowed.wildcard.length;

	if (errors.length && total === 0) {
		return json(
			{
				error: 'upstream_error',
				message: errors.join(' · '),
				blocked,
				allowed,
				errors
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(
		{
			blocked,
			allowed,
			errors: errors.length ? errors : undefined,
			partial: errors.length > 0
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
