import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { findRelatedUnblockedDomains } from '$lib/server/pihole-related-domains';

export const prerender = false;

export const GET: RequestHandler = async ({ request, fetch, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json({ error: 'misconfigured' }, { status: 500 });
	}

	const domain = String(url.searchParams.get('domain') ?? '').trim().toLowerCase();
	const mins = Math.min(1440, Math.max(5, Number(url.searchParams.get('minutes') ?? 120) || 120));
	if (!domain || !domain.includes('.')) {
		return json({ error: 'bad_request' }, { status: 400 });
	}

	const until = Math.floor(Date.now() / 1000);
	const from = until - mins * 60;
	const related = await findRelatedUnblockedDomains(fetch, domain, from, until);

	return json({ domain, minutes: mins, related }, { headers: { 'cache-control': 'no-store' } });
};
