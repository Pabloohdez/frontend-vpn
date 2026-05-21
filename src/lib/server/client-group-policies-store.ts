import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import { isValidPolicyIp, isValidVpnCn } from '$lib/server/policy-target';

export type ClientGroupPolicyTarget = 'ip' | 'vpn_cn';

export type ClientGroupPolicy = {
	id: string;
	target_type: ClientGroupPolicyTarget;
	ip: string;
	vpn_cn: string | null;
	/** IDs de grupos Pi-hole (v6) a aplicar en la ventana activa. */
	group_ids: number[];
	label: string | null;
	enabled: boolean;
	start: string;
	end: string;
	days: number[];
};

type Store = { policies: ClientGroupPolicy[] };

function storePath() {
	return (
		(env.CLIENT_GROUP_POLICIES_PATH ?? '').trim() ||
		path.join(process.cwd(), 'data', 'client-group-policies.json')
	);
}

function readStore(): Store {
	const p = storePath();
	try {
		if (!fs.existsSync(p)) return { policies: [] };
		const j = JSON.parse(fs.readFileSync(p, 'utf-8')) as Store;
		return { policies: Array.isArray(j.policies) ? j.policies.map(migratePolicy) : [] };
	} catch {
		return { policies: [] };
	}
}

function writeStore(store: Store) {
	const p = storePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export function migratePolicy(p: ClientGroupPolicy): ClientGroupPolicy {
	if (p.target_type === 'vpn_cn' || p.target_type === 'ip') return p;
	return { ...p, target_type: 'ip', vpn_cn: p.vpn_cn ?? null, group_ids: p.group_ids ?? [] };
}

export function listClientGroupPolicies() {
	return readStore().policies;
}

export function normalizeClientGroupPolicy(raw: Partial<ClientGroupPolicy>): ClientGroupPolicy | null {
	const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : randomUUID();
	const target_type: ClientGroupPolicyTarget = raw.target_type === 'vpn_cn' ? 'vpn_cn' : 'ip';
	const group_ids = Array.isArray(raw.group_ids)
		? [...new Set(raw.group_ids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0))]
		: [];
	if (!group_ids.length) return null;

	const start = typeof raw.start === 'string' ? raw.start : '09:00';
	const end = typeof raw.end === 'string' ? raw.end : '17:00';
	const days = Array.isArray(raw.days) ? raw.days.map(Number).filter((d) => d >= 0 && d <= 6) : [];
	const label = typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : null;
	const enabled = raw.enabled !== false;

	if (target_type === 'vpn_cn') {
		const vpn_cn = typeof raw.vpn_cn === 'string' ? raw.vpn_cn.trim() : '';
		if (!isValidVpnCn(vpn_cn)) return null;
		return {
			id,
			target_type: 'vpn_cn',
			ip: '',
			vpn_cn,
			group_ids,
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
		group_ids,
		label,
		enabled,
		start,
		end,
		days
	};
}

export function upsertClientGroupPolicy(raw: Partial<ClientGroupPolicy>) {
	const normalized = normalizeClientGroupPolicy(raw);
	if (!normalized) throw new Error('invalid_policy');
	const store = readStore();
	const idx = store.policies.findIndex((p) => p.id === normalized.id);
	if (idx >= 0) store.policies[idx] = normalized;
	else store.policies.unshift(normalized);
	writeStore(store);
	return normalized;
}

export function deleteClientGroupPolicy(id: string) {
	const store = readStore();
	const before = store.policies.length;
	store.policies = store.policies.filter((p) => p.id !== id);
	writeStore(store);
	return store.policies.length < before;
}

/** Todos los group_id referenciados en políticas (para no pisarlos al quitar ventana). */
export function allManagedGroupIds(): number[] {
	const set = new Set<number>();
	for (const p of listClientGroupPolicies()) {
		for (const g of p.group_ids) set.add(g);
	}
	return [...set];
}
