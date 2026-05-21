import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import {
	deleteCategoryPolicy,
	listCategories,
	listCategoryPolicies,
	type CategoryId,
	upsertCategoryDomains,
	upsertCategoryPolicy
} from '$lib/server/category-store';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeAudit } from '$lib/server/audit';
import { writeCriticalAudit } from '$lib/server/audit-signed';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read').ok) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}
	return json(
		{ categories: listCategories(), policies: listCategoryPolicies() },
		{ headers: { 'cache-control': 'no-store' } }
	);
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });
	const rl = rateLimitKey('admin:categories_write', getClientAddress(), { windowMs: 60_000, maxPerWindow: 20 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const body = await request.json().catch(() => null);
	if (body?.type === 'domains') {
		const id = body?.category_id as CategoryId;
		const domains = Array.isArray(body?.domains) ? (body.domains as unknown[]) : null;
		if (!id || !domains) return json({ error: 'bad_request' }, { status: 400 });
		const cat = upsertCategoryDomains(id, domains.map(String));
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'category_domains_update' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { category_id: id, count: cat?.domains?.length ?? 0 }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* MASTER_KEY opcional */
		}
		return json({ ok: true, category: cat }, { headers: { 'cache-control': 'no-store' } });
	}

	if (body?.type === 'policy') {
		const p = body?.policy;
		if (!p || typeof p !== 'object') return json({ error: 'bad_request' }, { status: 400 });
		const saved = upsertCategoryPolicy(p);
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'category_policy_upsert' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { policy_id: saved.id, ip: saved.ip, category_id: saved.category_id }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* MASTER_KEY opcional */
		}
		return json({ ok: true, policy: saved }, { headers: { 'cache-control': 'no-store' } });
	}

	return json({ error: 'bad_request' }, { status: 400 });
};

export const DELETE: RequestHandler = async ({ request, url, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });
	const rl = rateLimitKey('admin:categories_write', getClientAddress(), { windowMs: 60_000, maxPerWindow: 20 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const id = url.searchParams.get('policy_id');
	if (!id) return json({ error: 'bad_request' }, { status: 400 });
	const ok = deleteCategoryPolicy(id);
	if (ok) {
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'category_policy_delete' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { policy_id: id }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* MASTER_KEY opcional */
		}
	}
	return json({ ok }, { headers: { 'cache-control': 'no-store' } });
};

