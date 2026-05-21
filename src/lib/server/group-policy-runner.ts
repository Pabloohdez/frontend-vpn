import {
	allManagedGroupIds,
	listClientGroupPolicies,
	migratePolicy
} from '$lib/server/client-group-policies-store';
import { getClientCurrentGroups, setClientGroups } from '$lib/server/pihole-client-groups';
import { piholeV6Login, piholeV6Request } from '$lib/server/pihole-v6-session';
import { resolveTargetIps } from '$lib/server/policy-target';
import { readPrunedIpCnHistory, refreshIpCnHistoryBestEffort } from '$lib/server/vpn-ipcn-history';

function inWindow(now: Date, start: string, end: string, days: number[]) {
	const day = now.getDay();
	if (days.length > 0 && !days.includes(day)) return false;
	const [sh, sm] = start.split(':').map((x) => Number(x));
	const [eh, em] = end.split(':').map((x) => Number(x));
	if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return false;
	const cur = now.getHours() * 60 + now.getMinutes();
	const s = sh * 60 + sm;
	const e = eh * 60 + em;
	if (s === e) return true;
	if (s < e) return cur >= s && cur < e;
	return cur >= s || cur < e;
}

let lastRunMs = 0;

export async function tickClientGroupPolicies(fetchFn: typeof fetch, force = false) {
	const nowMs = Date.now();
	if (!force && nowMs - lastRunMs < 60_000) return;
	lastRunMs = nowMs;

	const policies = listClientGroupPolicies().filter((p) => p.enabled);
	const managed = new Set(allManagedGroupIds());
	if (!managed.size) return;

	const session = await piholeV6Login(fetchFn);
	if (!session) return;

	await refreshIpCnHistoryBestEffort(fetchFn);
	const history = readPrunedIpCnHistory();
	const now = new Date();

	const desiredByIp = new Map<string, number[]>();
	const affectedIps = new Set<string>();

	for (const raw of policies) {
		const p = migratePolicy(raw);
		for (const ip of resolveTargetIps(p, history)) {
			affectedIps.add(ip);
			if (!inWindow(now, p.start, p.end, p.days)) continue;
			desiredByIp.set(ip, [...new Set([...(desiredByIp.get(ip) ?? []), ...p.group_ids])]);
		}
	}

	// También revisar IPs que tenían grupos gestionados pero ya no están en ventana
	for (const p of policies) {
		for (const ip of resolveTargetIps(migratePolicy(p), history)) {
			affectedIps.add(ip);
		}
	}

	for (const ip of affectedIps) {
		const desired = desiredByIp.get(ip) ?? [];
		const { clientKey, groups } = await getClientCurrentGroups(fetchFn, session, ip);
		const keep = groups.filter((g) => !managed.has(g));
		const next = [...new Set([...keep, ...desired])];
		await setClientGroups(fetchFn, session, ip, clientKey, next.length ? next : [0]);
	}

	// noop ping to keep session warm
	await piholeV6Request(fetchFn, 'GET', '/api/groups', { session }).catch(() => null);
}
