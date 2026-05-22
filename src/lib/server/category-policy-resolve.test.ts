import { describe, expect, it } from 'vitest';
import { resolvePolicyTargetIps } from '$lib/server/category-policy-resolve';
import { normalizeCategoryPolicy, type CategoryPolicy } from '$lib/server/category-store';

describe('category-policy-resolve', () => {
	it('normaliza política por CN', () => {
		const p = normalizeCategoryPolicy({
			id: '1',
			target_type: 'vpn_cn',
			vpn_cn: 'alumno1',
			category_id: 'social',
			enabled: true,
			start: '09:00',
			end: '14:00',
			days: [1]
		});
		expect(p?.target_type).toBe('vpn_cn');
		expect(p?.vpn_cn).toBe('alumno1');
		expect(p?.ip).toBe('');
	});

	it('resuelve IPs de un CN desde histórico', () => {
		const policy: CategoryPolicy = {
			id: 'x',
			target_type: 'vpn_cn',
			ip: '',
			vpn_cn: 'alumno1',
			category_id: 'gaming',
			label: null,
			enabled: true,
			start: '09:00',
			end: '18:00',
			days: []
		};
		const history = {
			'203.0.113.2': { cn: 'alumno1', last_seen: '2026-01-01T00:00:00Z', real_lan: '192.0.2.50' }
		};
		expect(resolvePolicyTargetIps(policy, history).sort()).toEqual(['203.0.113.2', '192.0.2.50']);
	});
});
