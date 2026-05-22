import { describe, expect, it } from 'vitest';
import { resolveTargetIps } from '$lib/server/policy-target';

describe('resolveTargetIps', () => {
	it('resuelve CN a virtual y LAN', () => {
		const ips = resolveTargetIps(
			{ target_type: 'vpn_cn', ip: '', vpn_cn: 'user1' },
			{ '203.0.113.3': { cn: 'user1', last_seen: '2026-01-01', real_lan: '192.0.2.8' } }
		);
		expect(ips.sort()).toEqual(['203.0.113.3', '192.0.2.8']);
	});
});
