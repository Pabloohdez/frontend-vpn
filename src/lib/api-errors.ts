import { isUnauthorizedStatus, unauthorizedMessage } from '$lib/auth-client';

export type ApiFailure = {
	needsAuth: boolean;
	rateLimited: boolean;
	retryAfterSec: number | null;
	message: string;
};

function retryAfterSecFrom(
	retryHeader: string | null,
	body: Record<string, unknown> | null
): number | null {
	if (retryHeader) {
		const n = Number(retryHeader);
		if (Number.isFinite(n) && n > 0) return Math.ceil(n);
	}
	const fromBody = body?.retryAfterSec;
	if (typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody > 0) {
		return Math.ceil(fromBody);
	}
	return null;
}

/** Mensaje legible para respuestas fetch no OK (JSON o texto). */
export function describeApiFailure(
	status: number,
	body: unknown,
	fallback = 'La operación no se pudo completar.'
): ApiFailure {
	const rec =
		body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;

	const needsAuth = isUnauthorizedStatus(status);
	if (needsAuth) {
		return {
			needsAuth: true,
			rateLimited: false,
			retryAfterSec: null,
			message: unauthorizedMessage(status)
		};
	}

	const rateLimited = status === 429 || rec?.error === 'rate_limited' || rec?.error === 'locked';
	const retryAfterSec = rateLimited ? retryAfterSecFrom(null, rec) : null;

	if (rateLimited) {
		const sec = retryAfterSec;
		const wait = sec ? ` Espera ${sec} s e inténtalo de nuevo.` : ' Espera un momento e inténtalo de nuevo.';
		const prefix =
			rec?.error === 'locked'
				? 'Demasiados intentos fallidos.'
				: 'Demasiadas peticiones.';
		return {
			needsAuth: false,
			rateLimited: true,
			retryAfterSec: sec,
			message: `${prefix}${wait}`
		};
	}

	if (rec?.error === 'csrf_invalid' || status === 403) {
		return {
			needsAuth: false,
			rateLimited: false,
			retryAfterSec: null,
			message: 'Petición rechazada (CSRF). Recarga la página e inténtalo de nuevo.'
		};
	}

	const msg =
		(typeof rec?.message === 'string' && rec.message) ||
		(typeof rec?.hint === 'string' && rec.hint) ||
		(typeof rec?.error === 'string' && rec.error !== 'upstream_error' ? String(rec.error) : '') ||
		fallback;

	return {
		needsAuth: false,
		rateLimited: false,
		retryAfterSec: null,
		message: status >= 500 ? `${msg} (HTTP ${status})` : msg || `${fallback} (HTTP ${status})`
	};
}

export async function describeFetchResponse(
	res: Response,
	fallback?: string
): Promise<ApiFailure> {
	let body: unknown = null;
	const ct = res.headers.get('content-type') ?? '';
	if (ct.includes('application/json')) {
		body = await res.json().catch(() => null);
	} else {
		const text = await res.text().catch(() => '');
		if (text) {
			try {
				body = JSON.parse(text);
			} catch {
				body = { message: text.slice(0, 400) };
			}
		}
	}
	const base = describeApiFailure(res.status, body, fallback);
	if (base.rateLimited) {
		const rec =
			body && typeof body === 'object' && !Array.isArray(body)
				? (body as Record<string, unknown>)
				: null;
		const hdr = res.headers.get('Retry-After');
		let sec: number | null = null;
		if (hdr) {
			const n = Number(hdr);
			if (Number.isFinite(n) && n > 0) sec = Math.ceil(n);
		}
		if (!sec && typeof rec?.retryAfterSec === 'number') sec = Math.ceil(rec.retryAfterSec);
		if (sec) {
			const prefix =
				rec?.error === 'locked' ? 'Demasiados intentos fallidos.' : 'Demasiadas peticiones.';
			return {
				...base,
				retryAfterSec: sec,
				message: `${prefix} Espera ${sec} s e inténtalo de nuevo.`
			};
		}
	}
	return base;
}

/** Mensajes de error en formularios de login (home y /login). */
export function loginErrorMessage(status: number, body: unknown): string {
	const rec =
		body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
	if (rec?.error === 'totp_required') {
		return '2FA requerido: introduce el código TOTP o un recovery code.';
	}
	if (rec?.error === 'invalid_credentials') {
		return 'Credenciales inválidas';
	}
	return describeApiFailure(status, body, 'Credenciales inválidas').message;
}
