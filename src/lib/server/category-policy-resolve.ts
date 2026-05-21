import type { CategoryPolicy } from '$lib/server/category-store';
import { migrateCategoryPolicy } from '$lib/server/category-store';
import { resolveTargetIps } from '$lib/server/policy-target';
import type { IpCnHistory } from '$lib/server/vpn-ipcn-history';
import { readPrunedIpCnHistory } from '$lib/server/vpn-ipcn-history';
import { isValidVpnCn } from '$lib/server/policy-target';

export { isValidPolicyIp, isValidVpnCn } from '$lib/server/policy-target';

export function resolvePolicyTargetIps(policy: CategoryPolicy, history: IpCnHistory): string[] {
	return resolveTargetIps(migrateCategoryPolicy(policy), history);
}

export function listKnownVpnCns(history: IpCnHistory = readPrunedIpCnHistory()): string[] {
	const set = new Set<string>();
	for (const v of Object.values(history)) {
		const cn = (v.cn ?? '').trim();
		if (cn && isValidVpnCn(cn)) set.add(cn);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}
