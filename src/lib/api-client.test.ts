import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from '$lib/api-client';

describe('apiFetch', () => {
	it('añade x-csrf-token en POST cuando hay cookie', async () => {
		const original = document.cookie;
		document.cookie = 'csrf_token=test-csrf-token-value-123456';
		const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const h = new Headers(init?.headers);
			expect(h.get('x-csrf-token')).toBe('test-csrf-token-value-123456');
			return new Response('{}', { status: 200 });
		});
		vi.stubGlobal('fetch', fetchMock);
		try {
			await apiFetch('/api/admin/test', { method: 'POST', body: '{}' });
			expect(fetchMock).toHaveBeenCalledOnce();
		} finally {
			document.cookie = original;
			vi.unstubAllGlobals();
		}
	});

	it('no añade token en GET', async () => {
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
