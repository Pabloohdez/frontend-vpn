import { env } from '$env/dynamic/private';
import { fetchWithRetries } from '$lib/server/fetch-retry';

export function vm1BaseUrl() {
	return env.VPN_API_BASE_URL || '';
}

/**
 * URL absoluta en VM1 para descargar el bundle/perfil del usuario.
 * `VPN_VM1_BUNDLE_PATH_TEMPLATE`: ruta con `{cn}` (por defecto `/api/v1/admin/users/{cn}/bundle`).
 * Si empieza por `http://` o `https://`, se usa tal cual (sustituyendo `{cn}`).
 */
export function vm1BundleUrlForCn(cn: string): string {
	const template =
		env.VPN_VM1_BUNDLE_PATH_TEMPLATE?.trim() ||
		'/api/v1/admin/users/{cn}/bundle';
	const expanded = template.replace(/\{cn\}/g, encodeURIComponent(cn));
	if (/^https?:\/\//i.test(expanded)) {
		return expanded;
	}
	const base = vm1BaseUrl().replace(/\/$/, '');
	const path = expanded.startsWith('/') ? expanded : `/${expanded}`;
	return `${base}${path}`;
}

export function vm1ApiKey() {
	return env.VPN_API_KEY || '';
}

export function assertVm1Configured() {
	if (!vm1BaseUrl() || !vm1ApiKey()) {
		return { ok: false as const, error: 'misconfigured' as const };
	}
	return { ok: true as const };
}

/** GET/POST/DELETE hacia VM1 con reintentos ante errores transitorios. */
export function fetchVm1(url: string, init?: RequestInit): Promise<Response> {
	return fetchWithRetries(url, init, { attempts: 3 });
}

