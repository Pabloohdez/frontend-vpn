import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoleFromRequestCookie, requirePermissionFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import {
	deleteBlockSchedule,
	listBlockSchedules,
	upsertBlockSchedule
} from '$lib/server/block-schedules-store';
import { tickBlockSchedules } from '$lib/server/block-schedule-runner';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeCriticalAudit } from '$lib/server/audit-signed';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'read').ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	return json({ schedules: listBlockSchedules() }, { headers: { 'cache-control': 'no-store' } });
};

type Body = {
	id?: string;
	ip?: string;
	label?: string | null;
	enabled?: boolean;
	days?: number[];
	start?: string;
	end?: string;
};

export const POST: RequestHandler = async ({ request, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'block_schedules_write');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const rl = rateLimitKey('admin:block_schedules_write', getClientAddress(), { windowMs: 60_000, maxPerWindow: 20 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}
	const role = getRoleFromRequestCookie(request.headers.get('cookie')) ?? 'admin';
	const body = (await request.json().catch(() => null)) as Body | null;
	if (!body?.ip?.trim() || !body.start || !body.end) {
		return json({ error: 'bad_request', message: 'ip, start y end requeridos' }, { status: 400 });
	}
	try {
		const rec = upsertBlockSchedule({
			id: body.id,
			ip: body.ip,
			label: body.label,
			enabled: body.enabled,
			days: body.days,
			start: body.start,
			end: body.end,
			actor: role
		});
		await writeAudit({
			ts: new Date().toISOString(),
			actor: role,
			action: body.id ? 'block_schedule_update' : 'block_schedule_create',
			success: true,
			remote_ip: getClientAddress(),
			details: { schedule_id: rec.id, ip: rec.ip, start: rec.start, end: rec.end }
		});
		try {
			await writeCriticalAudit({
				ts: new Date().toISOString(),
				actor: role,
				action: body.id ? 'block_schedule_update' : 'block_schedule_create',
				success: true,
				remote_ip: getClientAddress(),
				details: { schedule_id: rec.id, ip: rec.ip, start: rec.start, end: rec.end }
			});
		} catch {
			/* best-effort */
		}
		void tickBlockSchedules(fetch, true);
		return json({ ok: true, schedule: rec }, { headers: { 'cache-control': 'no-store' } });
	} catch (e) {
		const msg = e instanceof Error ? e.message : 'error';
		return json(
			{ error: 'bad_request', message: msg === 'invalid_time' ? 'Horario inválido (HH:MM)' : msg },
			{ status: 400 }
		);
	}
};

export const DELETE: RequestHandler = async ({ request, url, fetch, getClientAddress }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'block_schedules_write');
	if (!authz.ok) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const rl = rateLimitKey('admin:block_schedules_write', getClientAddress(), { windowMs: 60_000, maxPerWindow: 20 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}
	const id = url.searchParams.get('id')?.trim();
	if (!id) return json({ error: 'bad_request' }, { status: 400 });
	const role = getRoleFromRequestCookie(request.headers.get('cookie')) ?? 'admin';
	const ok = deleteBlockSchedule(id);
	if (ok) {
		await writeAudit({
			ts: new Date().toISOString(),
			actor: role,
			action: 'block_schedule_delete',
			success: true,
			remote_ip: getClientAddress(),
			details: { schedule_id: id }
		});
		try {
			await writeCriticalAudit({
				ts: new Date().toISOString(),
				actor: role,
				action: 'block_schedule_delete',
				success: true,
				remote_ip: getClientAddress(),
				details: { schedule_id: id }
			});
		} catch {
			/* best-effort */
		}
		void tickBlockSchedules(fetch, true);
	}
	return json({ ok }, { headers: { 'cache-control': 'no-store' } });
};
