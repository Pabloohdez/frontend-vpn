import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeAudit } from '$lib/server/audit';
import { writeCriticalAudit } from '$lib/server/audit-signed';
import {
	getThreatIntelState,
	isThreatIntelEnabled,
	syncUrlhausMalwareDomains
} from '$lib/server/urlhaus-sync';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}
	return json(
		{
			enabled: isThreatIntelEnabled(),
			state: getThreatIntelState()
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};

export const POST: RequestHandler = async ({ request, getClientAddress, fetch }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const rl = rateLimitKey('admin:threat_intel_sync', getClientAddress(), {
		windowMs: 300_000,
		maxPerWindow: 6
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const result = await syncUrlhausMalwareDomains(fetch, { force: true });
	const entry = {
		ts: new Date().toISOString(),
		actor: authz.role,
		action: 'threat_intel_sync' as const,
		success: result.ok,
		remote_ip: getClientAddress(),
		details: result
	};
	await writeAudit(entry);
	try {
		await writeCriticalAudit(entry);
	} catch {
		/* MASTER_KEY opcional */
	}

	if (!result.ok) {
		return json({ error: 'upstream_error', message: result.error }, { status: 502 });
	}
	if (result.skipped) {
		return json({ ok: true, skipped: true, reason: result.reason }, { headers: { 'cache-control': 'no-store' } });
	}
	return json(
		{
			ok: true,
			added: result.added,
			total: result.total,
			fetched: result.fetched,
			source: result.source
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};
