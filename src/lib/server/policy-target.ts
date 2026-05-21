import type { IpCnHistory } from '$lib/server/vpn-ipcn-history';

export type PolicyTargetType = 'ip' | 'vpn_cn';

export type PolicyTarget = {
	target_type: PolicyTargetType;
	ip: string;
	vpn_cn: string | null;
};

const CN_RE = /^[a-zA-Z0-9.@_-]+$/;

export function isValidVpnCn(cn: string): boolean {
	const s = cn.trim();
	return s.length >= 1 && s.length <= 64 && CN_RE.test(s) && !s.startsWith('.') && !s.startsWith('-');
}

export function isValidPolicyIp(ip: string): boolean {
	return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim());
}

export function migratePolicyTarget<T extends PolicyTarget>(p: T): T & PolicyTarget {
	if (p.target_type === 'vpn_cn' || p.target_type === 'ip') return p;
	return { ...p, target_type: 'ip', vpn_cn: p.vpn_cn ?? null };
}

/** IPs Pi-hole (virtual VPN + LAN) para un objetivo IP o CN. */
export function resolveTargetIps(target: PolicyTarget, history: IpCnHistory): string[] {
	const t = migratePolicyTarget(target);
	if (t.target_type === 'ip') {
		return t.ip.trim() ? [t.ip.trim()] : [];
	}
	const cn = (t.vpn_cn ?? '').trim().toLowerCase();
	if (!cn) return [];
	const ips = new Set<string>();
	for (const [virtIp, entry] of Object.entries(history)) {
		if ((entry.cn ?? '').trim().toLowerCase() !== cn) continue;
		if (virtIp.trim()) ips.add(virtIp.trim());
		if (entry.real_lan?.trim()) ips.add(entry.real_lan.trim());
	}
	return [...ips];
}
