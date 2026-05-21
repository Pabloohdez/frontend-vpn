import type { CategoryPolicy } from '$lib/server/category-store';
import { migrateCategoryPolicy } from '$lib/server/category-store';
import type { IpCnHistory } from '$lib/server/vpn-ipcn-history';
import { readPrunedIpCnHistory } from '$lib/server/vpn-ipcn-history';

const CN_RE = /^[a-zA-Z0-9.@_-]+$/;

export function isValidVpnCn(cn: string): boolean {
	const s = cn.trim();
	return s.length >= 1 && s.length <= 64 && CN_RE.test(s) && !s.startsWith('.') && !s.startsWith('-');
}

export function isValidPolicyIp(ip: string): boolean {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim());
}

/** IPs Pi-hole a las que aplicar la política (virtual + LAN si hay histórico). */
export function resolvePolicyTargetIps(policy: CategoryPolicy, history: IpCnHistory): string[] {
	const p = migrateCategoryPolicy(policy);
	if (p.target_type === 'ip') {
		return p.ip.trim() ? [p.ip.trim()] : [];
	}
	const cn = (p.vpn_cn ?? '').trim().toLowerCase();
	if (!cn) return [];
	const ips = new Set<string>();
	for (const [virtIp, entry] of Object.entries(history)) {
		if ((entry.cn ?? '').trim().toLowerCase() !== cn) continue;
		if (virtIp.trim()) ips.add(virtIp.trim());
		if (entry.real_lan?.trim()) ips.add(entry.real_lan.trim());
	}
	return [...ips];
}

export function listKnownVpnCns(history: IpCnHistory = readPrunedIpCnHistory()): string[] {
	const set = new Set<string>();
	for (const v of Object.values(history)) {
		const cn = (v.cn ?? '').trim();
		if (cn && isValidVpnCn(cn)) set.add(cn);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}
