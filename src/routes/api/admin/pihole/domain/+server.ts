import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { fetchWithRetries } from '$lib/server/fetch-retry';
import { piholeAdminApiUrl } from '$lib/server/pihole-list-fetch';
import { assertPiholeConfigured, piholeApiToken } from '$lib/server/pihole';
import { writeAudit } from '$lib/server/audit';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeCriticalAudit } from '$lib/server/audit-signed';

export const prerender = false;

type Body = {
	domain: string;
	list: 'black' | 'white';
	op?: 'add' | 'remove';
	mode?: 'exact' | 'wildcard';
};

function normalizeDomain(input: string) {
	const d = String(input ?? '')
		.trim()
		.toLowerCase()
		.replace(/^\.+/, '')
		.replace(/\.$/, '');
	return d;
}

function isValidDomain(d: string) {
	// Validación pragmática: hostname con labels, sin espacios.
	if (!d) return false;
	if (d.length > 253) return false;
	if (/\s/.test(d)) return false;
	// En modo wildcard permitimos "*.dominio.tld" (lo convertimos internamente a dominio base).
	if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(d)) return false; // IP no
	if (!/^[a-z0-9.-]+$/.test(d)) return false;
	const labels = d.split('.').filter(Boolean);
	if (labels.length < 2) return false;
	for (const l of labels) {
		if (l.length < 1 || l.length > 63) return false;
		if (l.startsWith('-') || l.endsWith('-')) return false;
	}
	return true;
}

function escapeRegex(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wildcardRegexForDomain(domain: string) {
	// Coincide con el dominio y cualquier subdominio.
	// Ej: example.com -> (^|\\.)example\\.com$
	return `(^|\\.)${escapeRegex(domain)}$`;
}

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const rl = rateLimitKey('admin:pihole_domain_write', getClientAddress(), {
		windowMs: 60_000,
		maxPerWindow: 20
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{
				status: 429,
				headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' }
			}
		);
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return json(
			{ error: 'misconfigured', message: 'Falta PIHOLE_BASE_URL en el .env' },
			{ status: 500 }
		);
	}

	const body = (await request.json().catch(() => null)) as Body | null;
	const list = body?.list === 'white' ? 'white' : body?.list === 'black' ? 'black' : null;
	const op = body?.op === 'remove' ? 'remove' : 'add';
	const mode = body?.mode === 'wildcard' ? 'wildcard' : 'exact';

	let domain = normalizeDomain(body?.domain ?? '');
	if (mode === 'wildcard' && domain.startsWith('*.')) domain = domain.slice(2);
	if (!list || !isValidDomain(domain)) {
		return json(
			{ error: 'bad_request', message: 'Dominio inválido o list inválida' },
			{ status: 400 }
		);
	}

	// Pi-hole v5 API (legacy): /admin/api.php?list=<...>&add|sub=<...>&auth=<token?>
	const api = new URL(piholeAdminApiUrl());
	const token = piholeApiToken();
	if (token) api.searchParams.set('auth', token);

	if (mode === 'wildcard') {
		api.searchParams.set('list', list === 'black' ? 'regex_black' : 'regex_white');
		const value = wildcardRegexForDomain(domain);
		api.searchParams.set(op === 'remove' ? 'sub' : 'add', value);
	} else {
		api.searchParams.set('list', list);
		api.searchParams.set(op === 'remove' ? 'sub' : 'add', domain);
	}

	const upstream = await fetchWithRetries(api.toString(), { headers: { accept: 'application/json' } }, { attempts: 3 });
	const payload = await upstream.json().catch(() => null);

	const piholeSuccess =
		payload &&
		typeof payload === 'object' &&
		(payload as { success?: boolean }).success === true;
	const piholeMessage =
		payload && typeof payload === 'object' && typeof (payload as { message?: string }).message === 'string'
			? (payload as { message: string }).message
			: null;

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'pihole_list_change',
		success: upstream.ok,
		target_cn: undefined,
		details: {
			list,
			op,
			mode,
			domain,
			upstream_status: upstream.status
		}
	});
	// Audit crítico firmado
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'pihole_list_change',
			success: upstream.ok && piholeSuccess,
			remote_ip: getClientAddress(),
			details: { list, op, mode, domain, upstream_status: upstream.status }
		});
	} catch {
		/* best-effort */
	}

	if (!upstream.ok) {
		return json(
			{ ok: false, status: upstream.status, payload, message: 'Pi-hole no respondió al cambiar la lista' },
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	if (!piholeSuccess) {
		return json(
			{
				ok: false,
				status: upstream.status,
				payload,
				message: piholeMessage ?? 'Pi-hole rechazó el cambio en la lista'
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	return json(
		{
			ok: true,
			status: upstream.status,
			payload,
			message: piholeMessage ?? (op === 'remove' ? 'Dominio quitado de la lista' : 'Dominio añadido a la lista')
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};

