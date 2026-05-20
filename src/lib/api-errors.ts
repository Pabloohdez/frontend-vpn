import { unauthorizedMessage } from '$lib/auth-client';

export type ApiFailure = {
	needsAuth: boolean;
	rateLimited: boolean;
	retryAfterSec: number | null;
	message: string;
};

/** Códigos `error` habituales de la API → mensaje en español. */
const KNOWN_API_ERRORS: Record<string, string> = {
	totp_required: '2FA requerido: introduce el código TOTP o un recovery code.',
	invalid_credentials: 'Credenciales inválidas',
	invalid_code: 'Código TOTP incorrecto. Comprueba la hora del móvil.',
	already_enabled: 'El 2FA ya está activo en esta cuenta.',
	unauthorized: 'No autorizado. Inicia sesión con un rol con permisos.',
	misconfigured: 'El servidor no está configurado (revisa el .env).',
	bad_request: 'Petición inválida.',
	csrf_invalid: 'Petición rechazada (CSRF). Recarga la página e inténtalo de nuevo.',
	rate_limited: 'Demasiadas peticiones.',
	locked: 'Demasiados intentos fallidos.'
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

	const bodyMsg = typeof rec?.message === 'string' ? rec.message : '';

	if (status === 401) {
		return {
			needsAuth: true,
			rateLimited: false,
			retryAfterSec: null,
			message: unauthorizedMessage(401)
		};
	}

	if (
		rec?.error === 'csrf_invalid' ||
		(status === 403 && /csrf/i.test(bodyMsg))
	) {
		return {
			needsAuth: false,
			rateLimited: false,
			retryAfterSec: null,
			message: KNOWN_API_ERRORS.csrf_invalid
		};
	}

	if (status === 403) {
		const needsAuth = rec?.error === 'unauthorized';
		return {
			needsAuth,
			rateLimited: false,
			retryAfterSec: null,
			message: unauthorizedMessage(403)
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

	const knownCode =
		typeof rec?.error === 'string' && rec.error in KNOWN_API_ERRORS
			? KNOWN_API_ERRORS[rec.error]
			: null;

	const pieces = [
		typeof rec?.hint === 'string' ? rec.hint : '',
		typeof rec?.message === 'string' ? rec.message : '',
		typeof rec?.detail === 'string' ? rec.detail : '',
		rec?.error && typeof rec.error === 'string' && rec.error !== 'upstream_error' ? String(rec.error) : ''
	].filter((x) => x.length > 0);
	let msg = knownCode || pieces.join(' — ') || fallback;
	if (typeof rec?.upstream_status === 'number') {
		msg = msg.includes('VM1') || msg.includes('upstream')
			? msg
			: `${msg} (respuesta VM1: HTTP ${rec.upstream_status})`;
	}

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

/** TTL sugerido para toasts según tipo de error. */
export function noticeTtl(fail: ApiFailure, defaultMs = 6500): number {
	return fail.rateLimited ? 10_000 : defaultMs;
}

/** Mensaje corto para toasts / avisos inline (misma lógica que describeApiFailure). */
export function apiErrorMessage(
	status: number,
	body: unknown,
	fallback = 'La operación no se pudo completar.'
): string {
	return describeApiFailure(status, body, fallback).message;
}
