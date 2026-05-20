import fs from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { env } from '$env/dynamic/private';

type SignedAuditEntry = {
	ts: string;
	actor: string;
	action: string;
	target_cn: string | null;
	success: boolean;
	remote_ip: string | null;
	details: unknown;
	prev_hash: string | null;
	hash: string;
};

function logPath() {
	const base = env.AUDIT_SIGNED_PATH?.trim();
	if (base) return base;
	const audit = env.AUDIT_DB_PATH || '/app/data/audit.jsonl';
	return path.join(path.dirname(audit), 'audit-critical.signed.jsonl');
}

function masterKey() {
	const k = (env.MASTER_KEY ?? '').trim();
	if (!k) throw new Error('MASTER_KEY missing');
	return k;
}

function canonical(obj: Record<string, unknown>) {
	const keys = Object.keys(obj).sort();
	const out: Record<string, unknown> = {};
	for (const k of keys) out[k] = obj[k];
	return JSON.stringify(out);
}

function hmac(input: string) {
	return createHmac('sha256', masterKey()).update(input).digest('hex');
}

function lastHash(p: string): string | null {
	try {
		if (!fs.existsSync(p)) return null;
		const raw = fs.readFileSync(p, 'utf8').trim();
		if (!raw) return null;
		const lastLine = raw.split('\n').at(-1);
		if (!lastLine) return null;
		const j = JSON.parse(lastLine) as SignedAuditEntry;
		return typeof j.hash === 'string' ? j.hash : null;
	} catch {
		return null;
	}
}

export async function writeCriticalAudit(entry: {
	ts: string;
	actor: string;
	action: string;
	target_cn?: string | null;
	success: boolean;
	remote_ip?: string | null;
	details?: unknown;
}) {
	const p = logPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const prev = lastHash(p);
	const base = {
		ts: entry.ts,
		actor: entry.actor,
		action: entry.action,
		target_cn: entry.target_cn ?? null,
		success: entry.success,
		remote_ip: entry.remote_ip ?? null,
		details: entry.details ?? null,
		prev_hash: prev
	};
	const hash = hmac(canonical(base));
	const line: SignedAuditEntry = { ...base, hash };
	fs.appendFileSync(p, JSON.stringify(line) + '\n', 'utf8');
}

