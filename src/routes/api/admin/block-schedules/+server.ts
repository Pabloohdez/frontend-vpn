import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRoleFromRequestCookie, isAdminFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import {
	deleteBlockSchedule,
	listBlockSchedules,
	upsertBlockSchedule
} from '$lib/server/block-schedules-store';
import { tickBlockSchedules } from '$lib/server/block-schedule-runner';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
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
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
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
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
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
		void tickBlockSchedules(fetch, true);
	}
	return json({ ok }, { headers: { 'cache-control': 'no-store' } });
};
