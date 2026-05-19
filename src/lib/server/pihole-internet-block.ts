import { env } from '$env/dynamic/private';
import { piholeV6Login, piholeV6Request, type PiholeV6Session } from '$lib/server/pihole-v6-session';
import {
	type InternetBlockRecord,
	isIpv4,
	normalizeIp,
	removeInternetBlock,
	upsertInternetBlock
} from '$lib/server/internet-blocks-store';

const BLOCK_GROUP_NAME = 'panel-internet-off';
const BLOCK_GROUP_COMMENT = 'Creado por el panel VPN: bloqueo total DNS para clientes asignados';

type PiholeClient = {
	id?: string | number;
	ip?: string;
	name?: string;
	comment?: string;
	groups?: number[];
	group_ids?: number[];
};

function blockGroupName() {
	return env.PIHOLE_INTERNET_BLOCK_GROUP_NAME?.trim() || BLOCK_GROUP_NAME;
}

function parseGroupsArray(raw: unknown): number[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n >= 0);
}

function extractClients(data: unknown): PiholeClient[] {
	if (!data || typeof data !== 'object') return [];
	const o = data as Record<string, unknown>;
	if (Array.isArray(o.clients)) return o.clients as PiholeClient[];
	if (Array.isArray(o.data)) return o.data as PiholeClient[];
	if (Array.isArray(data)) return data as PiholeClient[];
	return [];
}

function extractGroups(data: unknown): { id: number; name: string }[] {
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

function clientKeyForIp(ip: string): string {
	return encodeURIComponent(ip);
}

function clientGroups(c: PiholeClient): number[] {
	const g = c.groups ?? c.group_ids;
	return parseGroupsArray(g);
}

async function findClientByIp(
	fetchFn: typeof fetch,
	ip: string,
	session: PiholeV6Session
): Promise<{ client: PiholeClient | null; clientKey: string }> {
	const list = await piholeV6Request(fetchFn, 'GET', '/api/clients', { session });
	if (!list.ok) return { client: null, clientKey: clientKeyForIp(ip) };

	for (const c of extractClients(list.data)) {
		const cip = typeof c.ip === 'string' ? c.ip.trim() : '';
		if (cip === ip) {
			const key =
				typeof c.id === 'string' || typeof c.id === 'number'
					? encodeURIComponent(String(c.id))
					: clientKeyForIp(ip);
			return { client: c, clientKey: key };
		}
	}
	return { client: null, clientKey: clientKeyForIp(ip) };
}

async function ensureBlockGroup(
	fetchFn: typeof fetch,
	session: PiholeV6Session
): Promise<{ ok: boolean; groupId: number | null; message?: string }> {
	const name = blockGroupName();
	const groupsRes = await piholeV6Request(fetchFn, 'GET', '/api/groups', { session });
	if (!groupsRes.ok) {
		return { ok: false, groupId: null, message: 'No se pudo leer grupos de Pi-hole (¿API v6 + token?)' };
	}

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
			body: { name, enabled: true, description: BLOCK_GROUP_COMMENT }
		});
		if (!created.ok) {
			return { ok: false, groupId: null, message: 'No se pudo crear el grupo de bloqueo en Pi-hole' };
		}
		const createdGroups = extractGroups(created.data);
		groupId = createdGroups[0]?.id ?? null;
		if (groupId === null && created.data && typeof created.data === 'object') {
			const id = Number((created.data as { id?: number }).id);
			if (Number.isFinite(id)) groupId = id;
		}
	}

	if (groupId === null) {
		return { ok: false, groupId: null, message: 'Grupo de bloqueo sin ID en Pi-hole' };
	}

	// Regex deny que aplica a todo dominio para este grupo
	const denyDomain = env.PIHOLE_INTERNET_BLOCK_REGEX?.trim() || '(^|.+\\.)';
	await piholeV6Request(fetchFn, 'POST', '/api/domains', {
		session,
		body: {
			domain: denyDomain,
			type: 'deny',
			kind: 'regex',
			groups: [groupId],
			comment: 'Panel: bloqueo total internet',
			enabled: true
		}
	});

	return { ok: true, groupId };
}

async function assignClientGroups(
	fetchFn: typeof fetch,
	clientKey: string,
	groups: number[],
	session: PiholeV6Session,
	ip: string
): Promise<{ ok: boolean; message?: string }> {
	const body = { groups, group_ids: groups, ip, comment: 'Panel VPN internet block' };
	let res = await piholeV6Request(fetchFn, 'PUT', `/api/clients/${clientKey}`, { session, body });
	if (res.ok) return { ok: true };

	// Registrar cliente si no existía
	const created = await piholeV6Request(fetchFn, 'POST', '/api/clients', {
		session,
		body: { ip, name: ip, groups, group_ids: groups }
	});
	if (!created.ok) {
		return {
			ok: false,
			message:
				'Pi-hole no aceptó el bloqueo por cliente. Requiere Pi-hole v6 con contraseña de aplicación en PIHOLE_API_TOKEN.'
		};
	}

	res = await piholeV6Request(fetchFn, 'PUT', `/api/clients/${clientKeyForIp(ip)}`, { session, body });
	return res.ok ? { ok: true } : { ok: false, message: 'No se pudo asignar el grupo de bloqueo al cliente' };
}

export type BlockInternetResult = {
	ok: boolean;
	ip: string;
	message: string;
	record?: InternetBlockRecord;
};

export async function blockInternetForIp(
	fetchFn: typeof fetch,
	ipRaw: string,
	opts: { label?: string | null; actor?: string; clientRaw?: string | null }
): Promise<BlockInternetResult> {
	const ip = normalizeIp(ipRaw);
	if (!isIpv4(ip)) {
		return {
			ok: false,
			ip,
			message:
				opts.clientRaw?.trim() ?
					'No se pudo obtener una IPv4 para este cliente. Espera otra consulta DNS o revisa dispositivos en el router.'
				:	'Solo se admite IPv4 del dispositivo (ej. 192.168.1.50)'
		};
	}

	const session = await piholeV6Login(fetchFn);
	if (!session) {
		return {
			ok: false,
			ip,
			message:
				'Pi-hole v6 no autenticó (configura PIHOLE_API_TOKEN como contraseña de aplicación). Sin esto no se puede bloquear por cliente.'
		};
	}

	const group = await ensureBlockGroup(fetchFn, session);
	if (!group.ok || group.groupId === null) {
		return { ok: false, ip, message: group.message ?? 'Error preparando grupo Pi-hole' };
	}

	const { client, clientKey } = await findClientByIp(fetchFn, ip, session);
	const groupsBefore = client ? clientGroups(client) : [0];
	const assign = await assignClientGroups(fetchFn, clientKey, [group.groupId], session, ip);
	if (!assign.ok) {
		return { ok: false, ip, message: assign.message ?? 'Error al bloquear en Pi-hole' };
	}

	const record: InternetBlockRecord = {
		ip,
		label: opts.label?.trim() || null,
		client_key: clientKey,
		groups_before: groupsBefore.length ? groupsBefore : [0],
		pi_hole_group_id: group.groupId,
		blocked_at: new Date().toISOString(),
		blocked_by: opts.actor ?? 'admin'
	};
	upsertInternetBlock(record);

	return {
		ok: true,
		ip,
		message: `Internet (DNS) bloqueado para ${ip}. El dispositivo seguirá en la red pero Pi-hole denegará sus consultas.`,
		record
	};
}

export async function unblockInternetForIp(
	fetchFn: typeof fetch,
	ipRaw: string
): Promise<BlockInternetResult> {
	const ip = normalizeIp(ipRaw);
	const prev = removeInternetBlock(ip);
	if (!prev) {
		return { ok: false, ip, message: 'Ese IP no constaba como bloqueado en el panel' };
	}

	const session = await piholeV6Login(fetchFn);
	if (!session) {
		return {
			ok: true,
			ip,
			message:
				'Registro local eliminado. No se pudo hablar con Pi-hole v6 para restaurar grupos; revísalo en la UI de Pi-hole si hace falta.'
		};
	}

	const restoreGroups = prev.groups_before.length ? prev.groups_before : [0];
	const assign = await assignClientGroups(fetchFn, prev.client_key, restoreGroups, session, ip);
	if (!assign.ok) {
		return {
			ok: true,
			ip,
			message:
				'Registro local eliminado. Pi-hole puede seguir con el grupo de bloqueo hasta que lo restaures manualmente en Pi-hole → Group Management.'
		};
	}

	return { ok: true, ip, message: `Internet restaurado para ${ip} (grupos Pi-hole anteriores).` };
}
