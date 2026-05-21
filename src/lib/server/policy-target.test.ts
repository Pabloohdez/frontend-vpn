import { describe, expect, it } from 'vitest';
import { resolveTargetIps } from '$lib/server/policy-target';

describe('resolveTargetIps', () => {
	it('resuelve CN a virtual y LAN', () => {
		const ips = resolveTargetIps(
			{ target_type: 'vpn_cn', ip: '', vpn_cn: 'user1' },
			{ '10.8.0.3': { cn: 'user1', last_seen: '2026-01-01', real_lan: '192.168.0.8' } }
		);
		expect(ips.sort()).toEqual(['10.8.0.3', '192.168.0.8']);
	});
});
