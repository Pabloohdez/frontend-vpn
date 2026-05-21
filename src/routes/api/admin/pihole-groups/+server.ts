import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { listKnownVpnCns } from '$lib/server/category-policy-resolve';
import {
	deleteClientGroupPolicy,
	listClientGroupPolicies,
	upsertClientGroupPolicy
} from '$lib/server/client-group-policies-store';
import { tickClientGroupPolicies } from '$lib/server/group-policy-runner';
import { createPiholeGroup, listPiholeGroups } from '$lib/server/pihole-client-groups';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeAudit } from '$lib/server/audit';

export const prerender = false;

export const GET: RequestHandler = async ({ request, fetch }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const listed = await listPiholeGroups(fetch);
	return json(
		{
			groups: listed.groups,
			policies: listClientGroupPolicies(),
			vpn_cns: listKnownVpnCns(),
			pihole_ok: listed.ok
		},
		{ headers: { 'cache-control': 'no-store' } }
	);
};

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const rl = rateLimitKey('admin:pihole_groups_write', getClientAddress(), {
		windowMs: 60_000,
		maxPerWindow: 25
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } }
		);
	}

	const body = await request.json().catch(() => null);

	if (body?.type === 'create_group') {
		const name = String(body?.name ?? '').trim();
		const description = String(body?.description ?? 'Grupo creado desde el panel VPN').trim();
		const created = await createPiholeGroup(fetch, name, description);
		if (!created.ok || !created.group) {
			return json(
				{ error: 'upstream_error', message: created.message ?? 'No se pudo crear el grupo' },
				{ status: 502 }
			);
		}
		await writeAudit({
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'pihole_list_change',
			success: true,
			remote_ip: getClientAddress(),
			details: { op: 'create_group', name: created.group.name, id: created.group.id }
		});
		return json({ ok: true, group: created.group }, { headers: { 'cache-control': 'no-store' } });
	}

	if (body?.type === 'policy') {
		try {
			const saved = upsertClientGroupPolicy(body.policy);
			await writeAudit({
				ts: new Date().toISOString(),
				actor: authz.role,
				action: 'pihole_list_change',
				success: true,
				remote_ip: getClientAddress(),
				details: {
					op: 'client_group_policy',
					policy_id: saved.id,
					group_ids: saved.group_ids,
					target_type: saved.target_type
				}
			});
			void tickClientGroupPolicies(fetch, true);
			return json({ ok: true, policy: saved }, { headers: { 'cache-control': 'no-store' } });
		} catch {
			return json({ error: 'bad_request', message: 'Política inválida' }, { status: 400 });
		}
	}

	return json({ error: 'bad_request' }, { status: 400 });
};

export const DELETE: RequestHandler = async ({ request, url, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'pihole_write');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const id = url.searchParams.get('policy_id');
	if (!id) return json({ error: 'bad_request' }, { status: 400 });

	const ok = deleteClientGroupPolicy(id);
	if (ok) {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'pihole_list_change',
			success: true,
			remote_ip: getClientAddress(),
			details: { op: 'client_group_policy_delete', policy_id: id }
		});
		void tickClientGroupPolicies(fetch, true);
	}
	return json({ ok }, { headers: { 'cache-control': 'no-store' } });
};
