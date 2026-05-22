import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

export type AuditAction =
	| 'login'
	| 'logout'
	| 'kick'
	| 'create_user'
	| 'revoke_user'
	| 'hide_revoked_user'
	| 'unhide_revoked_user'
	| 'download_bundle'
	| 'view_ip'
	| 'pihole_list_change'
	| 'internet_block'
	| 'internet_unblock'
	| 'dns_report_export'
	| 'block_schedule_create'
	| 'block_schedule_update'
	| 'block_schedule_delete'
	| 'panel_user_create'
	| 'panel_user_update'
	| 'panel_user_delete'
	| 'category_domains_update'
	| 'category_policy_upsert'
	| 'category_policy_delete'
	| 'threat_intel_sync'
	| 'watchdog_vm1_down'
	| 'watchdog_pihole_down';

export type AuditEntry = {
	ts: string;
	actor: string;
	action: AuditAction;
	target_cn?: string;
	success: boolean;
	remote_ip?: string;
	details?: unknown;
};

export type AuditFilters = {
	limit?: number;
	fromDay?: string; // YYYY-MM-DD
	toDay?: string; // YYYY-MM-DD
	action?: string;
	cn?: string;
	success?: boolean;
};

function logPath() {
	return env.AUDIT_DB_PATH || '/app/data/audit.jsonl';
}

function retentionDays() {
	const raw = Number(env.AUDIT_RETENTION_DAYS ?? 90);
	return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 90;
}

let lastPruneMs = 0;
function maybePruneAuditFile() {
	const now = Date.now();
	// Evitar trabajo constante en cada request.
	if (now - lastPruneMs < 60 * 60 * 1000) return;
	lastPruneMs = now;

	const p = logPath();
	if (!fs.existsSync(p)) return;

	try {
		const cutoff = now - retentionDays() * 24 * 60 * 60 * 1000;
		const content = fs.readFileSync(p, 'utf-8');
		const lines = content
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean);

		const kept: string[] = [];
		for (const l of lines) {
			const obj = safeJson(l) as any;
			const ts = typeof obj?.ts === 'string' ? Date.parse(obj.ts) : NaN;
			if (Number.isFinite(ts) && ts >= cutoff) kept.push(l);
		}

		// Solo reescribimos si realmente podó algo.
		if (kept.length !== lines.length) {
			fs.mkdirSync(path.dirname(p), { recursive: true });
			fs.writeFileSync(p, kept.join('\n') + (kept.length ? '\n' : ''), { encoding: 'utf-8' });
		}
	} catch {
		// best-effort
	}
}

export async function writeAudit(entry: AuditEntry) {
	maybePruneAuditFile();
	const p = logPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const line = JSON.stringify({
		ts: entry.ts,
		actor: entry.actor,
		action: entry.action,
		target_cn: entry.target_cn ?? null,
		success: entry.success,
		remote_ip: entry.remote_ip ?? null,
		details: entry.details ?? null
	});
	fs.appendFileSync(p, line + '\n', { encoding: 'utf-8' });
}

export async function listAudit(filters: AuditFilters = {}) {
	maybePruneAuditFile();
	const limit = Number.isFinite(filters.limit) ? (filters.limit as number) : 200;
	const p = logPath();
	if (!fs.existsSync(p)) return [];
	const content = fs.readFileSync(p, 'utf-8');
	const lines = content
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);

	const parsed = lines
		.map((l) => safeJson(l))
		.filter((x) => typeof x === 'object' && x !== null) as any[];

	const fromTs = filters.fromDay ? new Date(`${filters.fromDay}T00:00:00`).getTime() : null;
	const toTs = filters.toDay ? new Date(`${filters.toDay}T23:59:59.999`).getTime() : null;
	const action = filters.action?.trim() ? filters.action.trim() : null;
	const cn = filters.cn?.trim() ? filters.cn.trim() : null;
	const success = typeof filters.success === 'boolean' ? filters.success : null;

	const filtered = parsed.filter((r) => {
		const ts = typeof r.ts === 'string' ? Date.parse(r.ts) : NaN;
		if (fromTs !== null && Number.isFinite(ts) && ts < fromTs) return false;
		if (toTs !== null && Number.isFinite(ts) && ts > toTs) return false;
		if (action && String(r.action ?? '') !== action) return false;
		if (cn && String(r.target_cn ?? '') !== cn) return false;
		if (success !== null && Boolean(r.success) !== success) return false;
		return true;
	});

	const recent = filtered.slice(-limit).reverse();
	return recent.map((r) => ({
		ts: String(r.ts ?? ''),
		actor: String(r.actor ?? ''),
		action: String(r.action ?? ''),
		target_cn: r.target_cn ? String(r.target_cn) : null,
		success: Boolean(r.success),
		remote_ip: r.remote_ip ? String(r.remote_ip) : null,
		details: r.details ?? null
	}));
}

function safeJson(s: string) {
	try {
		return JSON.parse(s);
	} catch {
		return s;
	}
}

