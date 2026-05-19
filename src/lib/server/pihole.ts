import process from 'node:process';
import { env } from '$env/dynamic/private';

function readEnv(name: string): string {
	const fromProcess = process.env[name];
	if (typeof fromProcess === 'string' && fromProcess.trim()) return fromProcess.trim();
	const fromKit = env[name as keyof typeof env];
	if (typeof fromKit === 'string' && fromKit.trim()) return fromKit.trim();
	return '';
}

export function piholeBaseUrl() {
	return readEnv('PIHOLE_BASE_URL').replace(/\/+$/, '');
}

/** Quita `/admin` final para llamar a la API REST v6 (`/api/...`). */
export function piholeRootBaseUrl(): string {
	return piholeBaseUrl().replace(/\/admin\/?$/i, '');
}

export function piholeApiToken() {
	return readEnv('PIHOLE_API_TOKEN');
}

/**
 * URLs candidatas de Pi-hole (en orden de preferencia). Útil cuando la
 * resolución por nombre puede fallar y queremos un fallback explícito.
 *
 * Para añadir un fallback NO se hardcodea: configura `PIHOLE_FALLBACK_URL`
 * en `.env` (p. ej. la IP fija privada del Pi-hole en la LAN).
 */
export function piholeBaseUrlCandidates(): string[] {
	const primary = piholeBaseUrl();
	const fallback = readEnv('PIHOLE_FALLBACK_URL');
	const out: string[] = [];
	const push = (u: string) => {
		const x = u.replace(/\/+$/, '');
		if (x && !out.includes(x)) out.push(x);
	};
	push(primary);
	push(fallback);
	return out;
}

export function assertPiholeConfigured() {
	if (!piholeBaseUrl()) {
		return { ok: false as const, error: 'misconfigured' as const };
	}
	return { ok: true as const };
}
