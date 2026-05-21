import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { writeCriticalAudit } from '$lib/server/audit-signed';
import { rateLimitKey } from '$lib/server/rate-limit';
import type { AuthRole } from '$lib/server/auth';
import { createPanelUser, deletePanelUser, listPanelUsersPublic, updatePanelUser } from '$lib/server/panel-users-store';

export const prerender = false;

function requireAdmin(cookie: string | null) {
	return requirePermissionFromRequestCookie(cookie, 'openvpn_admin');
}

export const GET: RequestHandler = async ({ request }) => {
	const authz = requireAdmin(request.headers.get('cookie'));
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });
	return json(
		{ users: listPanelUsersPublic(), legacy_env_hint: true },
		{ headers: { 'cache-control': 'no-store' } }
	);
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const authz = requireAdmin(request.headers.get('cookie'));
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const rl = rateLimitKey('admin:panel_users_write', getClientAddress(), {
		windowMs: 60_000,
		maxPerWindow: 15
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const body = await request.json().catch(() => null);
	const username = body?.username;
	const password = body?.password;
	const role = body?.role as AuthRole | undefined;
	if (typeof username !== 'string' || typeof password !== 'string' || !role) {
		return json({ error: 'bad_request', message: 'username, password y role son obligatorios' }, { status: 400 });
	}

	try {
		const user = createPanelUser({ username, password, role });
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'panel_user_create' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { username: user.username, role: user.role, id: user.id }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* MASTER_KEY opcional */
		}
		return json({ ok: true, user }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Error al crear usuario';
		await writeAudit({
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'panel_user_create',
			success: false,
			remote_ip: getClientAddress(),
			details: { message }
		});
		return json({ error: 'bad_request', message }, { status: 400 });
	}
};

export const PUT: RequestHandler = async ({ request, getClientAddress }) => {
	const authz = requireAdmin(request.headers.get('cookie'));
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const rl = rateLimitKey('admin:panel_users_write', getClientAddress(), {
		windowMs: 60_000,
		maxPerWindow: 20
	});
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const body = await request.json().catch(() => null);
	const id = body?.id;
	if (typeof id !== 'string') return json({ error: 'bad_request' }, { status: 400 });

	try {
		const user = updatePanelUser({
			id,
			username: typeof body?.username === 'string' ? body.username : undefined,
			password: typeof body?.password === 'string' ? body.password : undefined,
			role: body?.role,
			enabled: typeof body?.enabled === 'boolean' ? body.enabled : undefined
		});
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'panel_user_update' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { id: user.id, username: user.username, role: user.role, enabled: user.enabled }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* noop */
		}
		return json({ ok: true, user }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Error al actualizar';
		return json({ error: 'bad_request', message }, { status: 400 });
	}
};

export const DELETE: RequestHandler = async ({ request, url, getClientAddress }) => {
	const authz = requireAdmin(request.headers.get('cookie'));
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const id = url.searchParams.get('id')?.trim();
	if (!id) return json({ error: 'bad_request' }, { status: 400 });

	try {
		deletePanelUser(id);
		const entry = {
			ts: new Date().toISOString(),
			actor: authz.role,
			action: 'panel_user_delete' as const,
			success: true,
			remote_ip: getClientAddress(),
			details: { id }
		};
		await writeAudit(entry);
		try {
			await writeCriticalAudit(entry);
		} catch {
			/* noop */
		}
		return json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Error al eliminar';
		return json({ error: 'bad_request', message }, { status: 400 });
	}
};
