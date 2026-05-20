import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

export type CategoryId = 'social' | 'streaming' | 'gaming' | 'gambling' | 'malware';

export type CategoryDef = {
	id: CategoryId;
	label: string;
	domains: string[]; // exact domains (o sufijos) gestionados por el panel
};

export type CategoryPolicy = {
	id: string;
	ip: string;
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
		const policies = Array.isArray(j.policies) ? (j.policies as CategoryPolicy[]) : [];
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

export function upsertCategoryPolicy(p: CategoryPolicy) {
	const db = readDb();
	const idx = db.policies.findIndex((x) => x.id === p.id);
	if (idx >= 0) db.policies[idx] = p;
	else db.policies.unshift(p);
	writeDb(db);
	return p;
}

export function deleteCategoryPolicy(id: string) {
	const db = readDb();
	const before = db.policies.length;
	db.policies = db.policies.filter((p) => p.id !== id);
	writeDb(db);
	return before !== db.policies.length;
}

