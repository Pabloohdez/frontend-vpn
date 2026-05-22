import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/csrf-client', () => ({
	csrfHeaders: vi.fn(() => ({ 'x-csrf-token': 'test-csrf-token-value-123456' }))
}));

import { apiFetch } from '$lib/api-client';
import { csrfHeaders } from '$lib/csrf-client';

describe('apiFetch', () => {
	it('añade x-csrf-token en POST cuando hay cookie', async () => {
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const h = new Headers(init?.headers);
			expect(h.get('x-csrf-token')).toBe('test-csrf-token-value-123456');
			return new Response('{}', { status: 200 });
		});
		vi.stubGlobal('fetch', fetchMock);
		try {
			await apiFetch('/api/admin/test', { method: 'POST', body: '{}' });
			expect(fetchMock).toHaveBeenCalledOnce();
			expect(csrfHeaders).toHaveBeenCalled();
		} finally {
			vi.unstubAllGlobals();
		}
	});

	it('no añade token en GET', async () => {
		vi.mocked(csrfHeaders).mockReturnValueOnce({});
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const h = new Headers(init?.headers);
			expect(h.get('x-csrf-token')).toBeNull();
			return new Response('{}', { status: 200 });
		});
		vi.stubGlobal('fetch', fetchMock);
		try {
			await apiFetch('/api/auth/me');
			expect(fetchMock).toHaveBeenCalledOnce();
		} finally {
			vi.unstubAllGlobals();
		}
	});
});
