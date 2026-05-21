import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';

import { isValidPolicyIp, isValidVpnCn } from '$lib/server/policy-target';

export type CategoryId = 'social' | 'streaming' | 'gaming' | 'gambling' | 'malware';

export type CategoryDef = {
	id: CategoryId;
	label: string;
	domains: string[]; // exact domains (o sufijos) gestionados por el panel
};

export type CategoryPolicyTarget = 'ip' | 'vpn_cn';

export type CategoryPolicy = {
	id: string;
	/** `ip` = dispositivo en Pi-hole; `vpn_cn` = todos los IPs del histórico OpenVPN con ese CN. */
	target_type: CategoryPolicyTarget;
	ip: string;
	vpn_cn: string | null;
	category_id: CategoryId;
	label: string | null;
	enabled: boolean;
	start: string; // HH:mm
	end: string; // HH:mm
	days: number[]; // 0..6
};

type CategoryDb = { categories: CategoryDef[]; policies: CategoryPolicy[] };

const DEFAULT_CATEGORIES: CategoryDef[] = [
	{ id: 'social', label: 'Redes sociales', domains: [] },
	{ id: 'streaming', label: 'Streaming', domains: [] },
	{ id: 'gaming', label: 'Juegos', domains: [] },
	{ id: 'gambling', label: 'Apuestas', domains: [] },
	{ id: 'malware', label: 'Malware/C2', domains: [] }
];

function dbPath() {
	return (env.CATEGORY_DB_PATH ?? '').trim() || path.join(process.cwd(), 'data', 'categories.json');
}

function readDb(): CategoryDb {
	const p = dbPath();
	if (!fs.existsSync(p)) return { categories: DEFAULT_CATEGORIES, policies: [] };
	try {
		const j = JSON.parse(fs.readFileSync(p, 'utf8')) as Partial<CategoryDb>;
		const cats = Array.isArray(j.categories) ? (j.categories as CategoryDef[]) : DEFAULT_CATEGORIES;
		const policies = Array.isArray(j.policies)
			? (j.policies as CategoryPolicy[]).map(migrateCategoryPolicy)
			: [];
		return { categories: cats.length ? cats : DEFAULT_CATEGORIES, policies };
	} catch {
		return { categories: DEFAULT_CATEGORIES, policies: [] };
	}
}

function writeDb(db: CategoryDb) {
	const p = dbPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(db, null, 2) + '\n', 'utf8');
}

export function listCategories() {
	return readDb().categories;
}
export function listCategoryPolicies() {
	return readDb().policies;
}

/** Migra políticas antiguas (solo `ip`). */
export function migrateCategoryPolicy(p: CategoryPolicy): CategoryPolicy {
	if (p.target_type === 'vpn_cn' || p.target_type === 'ip') return p;
	return { ...p, target_type: 'ip', vpn_cn: p.vpn_cn ?? null };
}

export function normalizeCategoryPolicy(raw: Partial<CategoryPolicy>): CategoryPolicy | null {
	const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID();
	const target_type: CategoryPolicyTarget =
		raw.target_type === 'vpn_cn' ? 'vpn_cn' : 'ip';
	const category_id = raw.category_id;
	if (!category_id) return null;

	const start = typeof raw.start === 'string' ? raw.start : '09:00';
	const end = typeof raw.end === 'string' ? raw.end : '17:00';
	const days = Array.isArray(raw.days) ? raw.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
	const enabled = raw.enabled !== false;
	const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null;

	if (target_type === 'vpn_cn') {
		const vpn_cn = typeof raw.vpn_cn === 'string' ? raw.vpn_cn.trim() : '';
		if (!isValidVpnCn(vpn_cn)) return null;
		return {
			id,
			target_type: 'vpn_cn',
			ip: '',
			vpn_cn,
			category_id,
			label,
			enabled,
			start,
			end,
			days
		};
	}

	const ip = typeof raw.ip === 'string' ? raw.ip.trim() : '';
	if (!isValidPolicyIp(ip)) return null;
	return {
		id,
		target_type: 'ip',
		ip,
		vpn_cn: null,
		category_id,
		label,
		enabled,
		start,
		end,
		days
	};
}

export function upsertCategoryDomains(id: CategoryId, domains: string[]) {
	const db = readDb();
	const next = domains
		.map((d) => String(d ?? '').trim().toLowerCase())
		.filter(Boolean)
		.filter((d, i, arr) => arr.indexOf(d) === i);
	db.categories = db.categories.map((c) => (c.id === id ? { ...c, domains: next } : c));
	writeDb(db);
	return db.categories.find((c) => c.id === id) ?? null;
}

export function upsertCategoryPolicy(p: Partial<CategoryPolicy>) {
	const normalized = normalizeCategoryPolicy(p);
	if (!normalized) throw new Error('Política de categoría inválida');
	const db = readDb();
	const idx = db.policies.findIndex((x) => x.id === normalized.id);
	if (idx >= 0) db.policies[idx] = normalized;
	else db.policies.unshift(normalized);
	writeDb(db);
	return normalized;
}

export function deleteCategoryPolicy(id: string) {
	const db = readDb();
	const before = db.policies.length;
	db.policies = db.policies.filter((p) => p.id !== id);
	writeDb(db);
	return before !== db.policies.length;
}

