import { describe, expect, it } from 'vitest';
import { normalizeClientGroupPolicy } from '$lib/server/client-group-policies-store';

describe('normalizeClientGroupPolicy', () => {
	it('acepta política por CN con group_ids', () => {
		const p = normalizeClientGroupPolicy({
			target_type: 'vpn_cn',
			vpn_cn: 'user1',
			group_ids: [2, 5],
			start: '08:00',
			end: '12:00',
			days: [1]
		});
		expect(p?.target_type).toBe('vpn_cn');
		expect(p?.group_ids).toEqual([2, 5]);
	});

	it('rechaza sin group_ids', () => {
		expect(
			normalizeClientGroupPolicy({
				target_type: 'ip',
				ip: '192.0.2.1',
				group_ids: [],
				start: '08:00',
				end: '12:00',
				days: []
			})
		).toBeNull();
	});
});
