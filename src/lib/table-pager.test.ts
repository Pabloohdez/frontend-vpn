import { describe, expect, it } from 'vitest';
import { filterRowsByQuery, paginate } from './table-pager';

describe('table-pager', () => {
	it('paginates', () => {
		const items = [1, 2, 3, 4, 5];
		expect(paginate(items, 1, 2).page).toEqual([1, 2]);
		expect(paginate(items, 2, 2).page).toEqual([3, 4]);
		expect(paginate(items, 3, 2).pages).toBe(3);
	});

	it('filters by query', () => {
		const rows = [
			{ a: 'login', b: 'admin' },
			{ a: 'ban', b: 'user' }
		];
		const out = filterRowsByQuery(rows, 'ban', (r) => `${r.a} ${r.b}`);
		expect(out).toHaveLength(1);
		expect(out[0].a).toBe('ban');
	});
});
