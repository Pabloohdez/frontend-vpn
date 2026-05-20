import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { randomBytes } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { shouldUseSecureCookies } from '$lib/server/auth';

const CSRF_COOKIE = 'csrf_token';

function b64url(buf: Buffer) {
	return buf
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

export function getOrCreateCsrfCookie(request: Request): { name: string; value: string; setCookie?: string } {
	const cookieHeader = request.headers.get('cookie') ?? '';
	const cookies = parseCookie(cookieHeader);
	const existing = cookies[CSRF_COOKIE];
	if (typeof existing === 'string' && existing.length >= 16) {
		return { name: CSRF_COOKIE, value: existing };
	}
	const value = b64url(randomBytes(24));
	const setCookie = serializeCookie(CSRF_COOKIE, value, {
		httpOnly: false,
		sameSite: 'lax',
		secure: shouldUseSecureCookies(request),
		path: '/',
		maxAge: 60 * 60 * 24 * 30
	});
	return { name: CSRF_COOKIE, value, setCookie };
}

export function verifyCsrf(event: RequestEvent): boolean {
	const m = event.request.method.toUpperCase();
	if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
	// Permitimos login/refresh/logout sin CSRF para no bloquear bootstrap; el refresh es httpOnly.
	const p = event.url.pathname;
	if (p === '/api/auth/login' || p === '/api/auth/refresh' || p === '/api/auth/logout') return true;

	const cookieHeader = event.request.headers.get('cookie') ?? '';
	const cookies = parseCookie(cookieHeader);
	const cookieToken = cookies[CSRF_COOKIE];
	const headerToken = event.request.headers.get('x-csrf-token');
	if (!cookieToken || !headerToken) return false;
	return cookieToken === headerToken;
}

