import { piholeV6Login, piholeV6Request, type PiholeV6Session } from '$lib/server/pihole-v6-session';

type PiholeClient = {
	id?: string | number;
	ip?: string;
	groups?: number[];
	group_ids?: number[];
};

function parseGroups(raw: unknown): number[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0);
}

function clientGroups(c: PiholeClient): number[] {
	return parseGroups(c.groups ?? c.group_ids);
}

function extractClients(data: unknown): PiholeClient[] {
	if (!data || typeof data !== 'object') return [];
	const o = data as Record<string, unknown>;
	if (Array.isArray(o.clients)) return o.clients as PiholeClient[];
	if (Array.isArray(o.data)) return o.data as PiholeClient[];
	if (Array.isArray(data)) return data as PiholeClient[];
	return [];
}

export function extractGroups(data: unknown): { id: number; name: string }[] {
	if (!data || typeof data !== 'object') return [];
	const o = data as Record<string, unknown>;
	const arr = Array.isArray(o.groups) ? o.groups : Array.isArray(o.data) ? o.data : Array.isArray(data) ? data : [];
	const out: { id: number; name: string }[] = [];
	for (const g of arr) {
		if (!g || typeof g !== 'object') continue;
		const go = g as Record<string, unknown>;
		const id = Number(go.id ?? go.group_id);
		const name = String(go.name ?? '').trim();
		if (Number.isFinite(id) && name) out.push({ id, name });
	}
	return out;
}

function keyForIp(ip: string) {
	return encodeURIComponent(ip);
}

export async function listPiholeGroups(
	fetchFn: typeof fetch
): Promise<{ ok: boolean; groups: { id: number; name: string }[]; session: PiholeV6Session | null }> {
	const session = await piholeV6Login(fetchFn);
	if (!session) return { ok: false, groups: [], session: null };
	const res = await piholeV6Request(fetchFn, 'GET', '/api/groups', { session });
	if (!res.ok) return { ok: false, groups: [], session };
	return { ok: true, groups: extractGroups(res.data), session };
}

export async function createPiholeGroup(
	fetchFn: typeof fetch,
	name: string,
	description: string
): Promise<{ ok: boolean; group: { id: number; name: string } | null; message?: string }> {
	const trimmed = name.trim();
	if (!trimmed || trimmed.length > 64) {
		return { ok: false, group: null, message: 'Nombre de grupo inválido' };
	}
	const eg = await ensureGroup(fetchFn, trimmed, description);
	if (!eg.ok || eg.groupId == null) {
		return { ok: false, group: null, message: 'No se pudo crear el grupo en Pi-hole' };
	}
	return { ok: true, group: { id: eg.groupId, name: trimmed } };
}

export async function ensureGroup(
	fetchFn: typeof fetch,
	name: string,
	description: string
): Promise<{ ok: boolean; groupId: number | null; session: PiholeV6Session | null }> {
	const session = await piholeV6Login(fetchFn);
	if (!session) return { ok: false, groupId: null, session: null };
	const groupsRes = await piholeV6Request(fetchFn, 'GET', '/api/groups', { session });
	if (!groupsRes.ok) return { ok: false, groupId: null, session };
	let groupId: number | null = null;
	for (const g of extractGroups(groupsRes.data)) {
		if (g.name === name) {
			groupId = g.id;
			break;
		}
	}
	if (groupId === null) {
		const created = await piholeV6Request(fetchFn, 'POST', '/api/groups', {
			session,
			body: { name, enabled: true, description }
		});
		if (!created.ok) return { ok: false, groupId: null, session };
		const createdGroups = extractGroups(created.data);
		groupId = createdGroups[0]?.id ?? null;
		if (groupId === null && created.data && typeof created.data === 'object') {
			const id = Number((created.data as { id?: number }).id);
			if (Number.isFinite(id)) groupId = id;
		}
	}
	return { ok: groupId !== null, groupId, session };
}

export async function getClientCurrentGroups(
	fetchFn: typeof fetch,
	session: PiholeV6Session,
	ip: string
): Promise<{ clientKey: string; groups: number[] }> {
	const list = await piholeV6Request(fetchFn, 'GET', '/api/clients', { session });
	if (!list.ok) return { clientKey: keyForIp(ip), groups: [0] };
	for (const c of extractClients(list.data)) {
		const cip = typeof c.ip === 'string' ? c.ip.trim() : '';
		if (cip === ip) {
			const clientKey =
				typeof c.id === 'string' || typeof c.id === 'number' ? encodeURIComponent(String(c.id)) : keyForIp(ip);
			return { clientKey, groups: clientGroups(c).length ? clientGroups(c) : [0] };
		}
	}
	return { clientKey: keyForIp(ip), groups: [0] };
}

export async function setClientGroups(
	fetchFn: typeof fetch,
	session: PiholeV6Session,
	ip: string,
	clientKey: string,
	groups: number[]
): Promise<boolean> {
	const body = { groups, group_ids: groups, ip, comment: 'Panel VPN groups' };
	let res = await piholeV6Request(fetchFn, 'PUT', `/api/clients/${clientKey}`, { session, body });
	if (res.ok) return true;
	const created = await piholeV6Request(fetchFn, 'POST', '/api/clients', {
		session,
		body: { ip, name: ip, groups, group_ids: groups }
	});
	if (!created.ok) return false;
	res = await piholeV6Request(fetchFn, 'PUT', `/api/clients/${keyForIp(ip)}`, { session, body });
	return res.ok;
}

