import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

/** 0 = domingo … 6 = sábado (convención JS Date.getDay). */
export type BlockSchedule = {
	id: string;
	ip: string;
	label: string | null;
	enabled: boolean;
	/** Días activos (0-6). Vacío = todos los días. */
	days: number[];
	/** HH:MM en hora local del servidor. */
	start: string;
	end: string;
	created_at: string;
	created_by: string;
	updated_at: string;
};

type Store = { schedules: BlockSchedule[] };

function storePath() {
	return env.BLOCK_SCHEDULES_PATH?.trim() || path.join(process.cwd(), 'data', 'block-schedules.json');
}

function readStore(): Store {
	const p = storePath();
	try {
		if (!fs.existsSync(p)) return { schedules: [] };
		const raw = fs.readFileSync(p, 'utf-8');
		const j = JSON.parse(raw) as Store;
		if (!j || !Array.isArray(j.schedules)) return { schedules: [] };
		return j;
	} catch {
		return { schedules: [] };
	}
}

function writeStore(store: Store) {
	const p = storePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export function listBlockSchedules(): BlockSchedule[] {
	return readStore().schedules;
}

export function getBlockSchedule(id: string): BlockSchedule | null {
	return readStore().schedules.find((s) => s.id === id) ?? null;
}

export function schedulesForIp(ip: string): BlockSchedule[] {
	const norm = ip.trim();
	return readStore().schedules.filter((s) => s.ip === norm);
}

export type UpsertScheduleInput = {
	id?: string;
	ip: string;
	label?: string | null;
	enabled?: boolean;
	days?: number[];
	start: string;
	end: string;
	actor: string;
};

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseTimeHm(s: string): { h: number; m: number } | null {
	const m = TIME_RE.exec(s.trim());
	if (!m) return null;
	return { h: Number(m[1]), m: Number(m[2]) };
}

export function upsertBlockSchedule(input: UpsertScheduleInput): BlockSchedule {
	const start = parseTimeHm(input.start);
	const end = parseTimeHm(input.end);
	if (!start || !end) throw new Error('invalid_time');
	const ip = input.ip.trim();
	if (!ip) throw new Error('invalid_ip');
	const days = (input.days ?? []).map((d) => Math.floor(d)).filter((d) => d >= 0 && d <= 6);
	const now = new Date().toISOString();
	const store = readStore();
	const existingIdx = input.id ? store.schedules.findIndex((s) => s.id === input.id) : -1;
	const rec: BlockSchedule = {
		id: input.id && existingIdx >= 0 ? input.id : randomUUID(),
		ip,
		label: input.label?.trim() || null,
		enabled: input.enabled !== false,
		days,
		start: input.start.trim(),
		end: input.end.trim(),
		created_at: existingIdx >= 0 ? store.schedules[existingIdx].created_at : now,
		created_by: existingIdx >= 0 ? store.schedules[existingIdx].created_by : input.actor,
		updated_at: now
	};
	if (existingIdx >= 0) store.schedules[existingIdx] = rec;
	else store.schedules.push(rec);
	writeStore(store);
	return rec;
}

export function deleteBlockSchedule(id: string): boolean {
	const store = readStore();
	const before = store.schedules.length;
	store.schedules = store.schedules.filter((s) => s.id !== id);
	writeStore(store);
	return store.schedules.length < before;
}

/** Minutos desde medianoche local. */
function minutesOfDay(d: Date): number {
	return d.getHours() * 60 + d.getMinutes();
}

function hmToMinutes(hm: string): number {
	const p = parseTimeHm(hm);
	if (!p) return 0;
	return p.h * 60 + p.m;
}

/**
 * ¿Debe estar bloqueado ahora según este horario?
 * Soporta ventanas que cruzan medianoche (ej. 22:00–06:00).
 */
export function scheduleActiveNow(schedule: BlockSchedule, at: Date = new Date()): boolean {
	if (!schedule.enabled) return false;
	if (schedule.days.length > 0 && !schedule.days.includes(at.getDay())) return false;
	const nowMin = minutesOfDay(at);
	const startMin = hmToMinutes(schedule.start);
	const endMin = hmToMinutes(schedule.end);
	if (startMin === endMin) return true; // bloqueo todo el día en días seleccionados
	if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
	// cruza medianoche
	return nowMin >= startMin || nowMin < endMin;
}

export function shouldIpBeBlockedBySchedule(ip: string, at: Date = new Date()): BlockSchedule | null {
	const list = schedulesForIp(ip).filter((s) => scheduleActiveNow(s, at));
	return list[0] ?? null;
}

export const SCHEDULE_BLOCKED_BY_PREFIX = 'schedule:';

export function isScheduleBlockedRecord(blockedBy: string | null | undefined): boolean {
	return Boolean(blockedBy?.startsWith(SCHEDULE_BLOCKED_BY_PREFIX));
}
