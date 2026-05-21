import type { Handle } from '@sveltejs/kit';
import { shouldUseSecureCookies } from '$lib/server/auth';
import { tickBlockSchedules } from '$lib/server/block-schedule-runner';
import { getRoleFromEventCookiesAsync } from '$lib/server/auth';
import { getOrCreateCsrfCookie, verifyCsrf } from '$lib/server/csrf';
import { tickCategoryPolicies } from '$lib/server/category-runner';
import { tickThreatIntelSync } from '$lib/server/urlhaus-sync';

/**
 * Cabeceras de seguridad globales. La Content-Security-Policy se gestiona en
 * `svelte.config.js` con `kit.csp` para que SvelteKit calcule hashes de los
 * scripts inline (theme, hidratación) automáticamente.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// CSRF: set cookie if missing; reject mutating requests without header token.
	const csrf = getOrCreateCsrfCookie(event.request);
	if (!verifyCsrf(event)) {
		return new Response(JSON.stringify({ error: 'csrf_invalid', message: 'CSRF inválido' }), {
			status: 403,
			headers: {
				'content-type': 'application/json',
				'cache-control': 'no-store',
				...(csrf.setCookie ? { 'set-cookie': csrf.setCookie } : {})
			}
		});
	}

	// Refresco silencioso: si expira access pero hay refresh válido, renueva la sesión.
	// (Evita 401 intermitentes por access corto.)
	// Solo aplica a requests del mismo origen.
	try {
		const role = await getRoleFromEventCookiesAsync(event);
		if (!role) {
			// noop: el refresh endpoint lo llamará el cliente si quiere
		}
	} catch {
		/* ignore */
	}
	// Aplica horarios de bloqueo DNS (throttle interno ~60s).
	void tickBlockSchedules(event.fetch);
	// Aplica categorías por horario (throttle interno ~60s).
	void tickCategoryPolicies(event.fetch);
	void tickThreatIntelSync(event.fetch);

	const response = await resolve(event);
	if (csrf.setCookie) response.headers.append('set-cookie', csrf.setCookie);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set(
		'Permissions-Policy',
		[
			'camera=()',
			'microphone=()',
			'geolocation=()',
			'payment=()',
			'usb=()',
			'magnetometer=()',
			'gyroscope=()',
			'accelerometer=()',
			'interest-cohort=()'
		].join(', ')
	);
	response.headers.set('X-DNS-Prefetch-Control', 'off');

	// COOP/CORP en HTTP LAN provocan avisos en consola y no aportan en acceso local sin TLS.
	if (shouldUseSecureCookies(event.request)) {
		response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
		response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}

	return response;
};
