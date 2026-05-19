import type { Handle } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { shouldUseSecureCookies } from '$lib/server/auth';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()'
	);

	if (shouldUseSecureCookies(event.request)) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}

	if (!dev) {
		response.headers.set(
			'Content-Security-Policy',
			[
				"default-src 'self'",
				"script-src 'self' 'unsafe-inline'",
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
				"font-src 'self' https://fonts.gstatic.com data:",
				"img-src 'self' data:",
				"connect-src 'self'",
				"frame-ancestors 'none'",
				"base-uri 'self'"
			].join('; ')
		);
	}

	return response;
};
