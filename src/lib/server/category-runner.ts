import { listCategories, listCategoryPolicies, type CategoryId } from '$lib/server/category-store';
import { ensureGroup, getClientCurrentGroups, setClientGroups } from '$lib/server/pihole-client-groups';
import { piholeV6Request } from '$lib/server/pihole-v6-session';

const GROUP_PREFIX = 'panel-cat-';

function groupNameForCategory(id: CategoryId) {
	return `${GROUP_PREFIX}${id}`;
}

function inWindow(now: Date, start: string, end: string, days: number[]) {
	const day = now.getDay();
	if (!days.includes(day)) return false;
	const [sh, sm] = start.split(':').map((x) => Number(x));
	const [eh, em] = end.split(':').map((x) => Number(x));
	if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return false;
	const cur = now.getHours() * 60 + now.getMinutes();
	const s = sh * 60 + sm;
	const e = eh * 60 + em;
	if (s === e) return true;
	if (s < e) return cur >= s && cur < e;
	// cruza medianoche
	return cur >= s || cur < e;
}

let lastRunMs = 0;

export async function tickCategoryPolicies(fetchFn: typeof fetch, force = false) {
	const nowMs = Date.now();
	if (!force && nowMs - lastRunMs < 60_000) return;
	lastRunMs = nowMs;

	const categories = listCategories();
	const policies = listCategoryPolicies().filter((p) => p.enabled);
	if (!policies.length) return;

	// ensure groups + rules
	const groupIds = new Map<CategoryId, number>();
	let session: any = null;
	for (const c of categories) {
		const eg = await ensureGroup(fetchFn, groupNameForCategory(c.id), `Panel VPN: categoría ${c.label}`);
		if (!eg.ok || eg.groupId == null || !eg.session) continue;
		groupIds.set(c.id, eg.groupId);
		session = eg.session;

		// ensure deny exact domains attached to this group (best-effort, idempotencia la maneja Pi-hole)
		for (const d of c.domains) {
			await piholeV6Request(fetchFn, 'POST', '/api/domains', {
				session: eg.session,
				body: {
					domain: d,
					type: 'deny',
					kind: 'exact',
					groups: [eg.groupId],
					comment: `Panel: categoría ${c.id}`,
					enabled: true
				}
			});
		}
	}

	if (!session || groupIds.size === 0) return;

	// desired groups per ip
	const now = new Date();
	const desiredByIp = new Map<string, number[]>();
	for (const p of policies) {
		if (!inWindow(now, p.start, p.end, p.days)) continue;
		const gid = groupIds.get(p.category_id);
		if (!gid) continue;
		desiredByIp.set(p.ip, [...new Set([...(desiredByIp.get(p.ip) ?? []), gid])]);
	}

	// apply per ip: keep non-category groups, swap category groups to desired
	for (const [ip, desiredCatGroups] of desiredByIp.entries()) {
		const { clientKey, groups } = await getClientCurrentGroups(fetchFn, session, ip);
		const keep = groups.filter((g) => ![...groupIds.values()].includes(g));
		const next = [...new Set([...keep, ...desiredCatGroups])];
		await setClientGroups(fetchFn, session, ip, clientKey, next.length ? next : [0]);
	}
}

