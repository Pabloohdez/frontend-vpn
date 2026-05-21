import { csrfHeaders } from '$lib/csrf-client';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * fetch del panel con CSRF en métodos mutantes (misma política que `hooks.server.ts`).
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
	const method = (init?.method ?? 'GET').toUpperCase();
	const headers = new Headers(init?.headers);
	if (MUTATING.has(method)) {
		for (const [k, v] of Object.entries(csrfHeaders())) headers.set(k, v);
	}
	return fetch(input, {
		credentials: init?.credentials ?? 'same-origin',
		...init,
		headers
	});
}
