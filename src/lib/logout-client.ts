import { browser } from '$app/environment';
import { apiFetch } from '$lib/api-client';

/** Cierra sesión en el servidor y vuelve al selector OpenVPN / Pi-hole / Auditoría. */
export async function logoutAndGoHome(): Promise<void> {
	if (!browser) return;

	try {
		await apiFetch('/api/auth/logout', {
			method: 'POST',
			headers: { 'cache-control': 'no-store' }
		});
	} catch {
		/* Redirigimos igual: el usuario debe poder salir aunque falle la API */
	}

	window.location.assign('/');
}
