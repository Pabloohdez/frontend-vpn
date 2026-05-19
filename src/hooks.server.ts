import type { Handle } from '@sveltejs/kit';
import { shouldUseSecureCookies } from '$lib/server/auth';

/**
 * Cabeceras de seguridad globales. La Content-Security-Policy se gestiona en
 * `svelte.config.js` con `kit.csp` para que SvelteKit calcule hashes de los
 * scripts inline (theme, hidratación) automáticamente.
 */
export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

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
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	response.headers.set('X-DNS-Prefetch-Control', 'off');

	if (shouldUseSecureCookies(event.request)) {
		response.headers.set(
			'Strict-Transport-Security',
			'max-age=31536000; includeSubDomains'
		);
	}

	return response;
};
