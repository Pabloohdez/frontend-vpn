import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { checkDomainViaPiholeDns } from '$lib/server/pihole-dns-check';

export const prerender = false;

function normalizeHost(input: string) {
	return String(input ?? '')
		.trim()
		.toLowerCase()
		.replace(/^\.+/, '')
		.replace(/\.$/, '');
}

export const GET: RequestHandler = async ({ request, url }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json({ error: 'misconfigured' }, { status: 500 });
	}

	const domain = normalizeHost(url.searchParams.get('domain') ?? '');
	if (!domain || !domain.includes('.')) {
		return json({ error: 'bad_request', message: 'Dominio inválido' }, { status: 400 });
	}

	const result = await checkDomainViaPiholeDns(domain);
	return json(result, { headers: { 'cache-control': 'no-store' } });
};
