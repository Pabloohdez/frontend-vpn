import { fetchWithRetries } from '$lib/server/fetch-retry';
import { piholeApiToken, piholeBaseUrl } from '$lib/server/pihole';

export type PiholeListKind = 'black' | 'regex_black' | 'white' | 'regex_white';

export type PiholeListFetchResult = {
	ok: boolean;
	status: number;
	entries: string[];
	message?: string;
};

/** URL de api.php sin duplicar `/admin`. */
export function piholeAdminApiUrl(): string {
	const base = piholeBaseUrl().replace(/\/admin\/?$/i, '').replace(/\/+$/, '');
	return `${base}/admin/api.php`;
}

function normalizeOne(x: unknown): string | null {
	if (x === null || x === undefined) return null;
	if (typeof x === 'string') return x.trim() || null;
	if (typeof x === 'number' || typeof x === 'boolean') return String(x);

	if (typeof x === 'object') {
		const o = x as Record<string, unknown>;
		for (const key of ['domain', 'name', 'regex', 'pattern', 'value']) {
			const c = o[key];
			if (typeof c === 'string' && c.trim()) return c.trim();
		}
		return null;
	}

	return null;
}

function rowsFromUnknown(value: unknown): unknown[] {
	if (!value) return [];
	if (Array.isArray(value)) return value;
	if (typeof value === 'object') return Object.values(value as Record<string, unknown>);
	return [];
}

/** Extrae dominios/regex de la respuesta legacy de Pi-hole (v5 y v6). */
export function normalizeListPayload(payload: unknown): string[] {
	if (!payload) return [];

	if (Array.isArray(payload)) {
		return payload.map(normalizeOne).filter(Boolean) as string[];
	}

	if (typeof payload !== 'object') return [];

	const o = payload as Record<string, unknown>;

	if (o.success === false) return [];

	const dataRows = rowsFromUnknown(o.data);
	if (dataRows.length) {
		return dataRows.map(normalizeOne).filter(Boolean) as string[];
	}

	for (const key of ['list', 'blacklist', 'whitelist', 'regex_black', 'regex_white', 'domains']) {
		const rows = rowsFromUnknown(o[key]);
		if (rows.length) {
			return rows.map(normalizeOne).filter(Boolean) as string[];
		}
	}

	const fromValues = Object.values(o).map(normalizeOne).filter(Boolean) as string[];
	if (fromValues.length) return fromValues;

	const keys = Object.keys(o)
		.map((k) => k.trim())
		.filter((k) => k && k !== 'success' && k !== 'message');
	if (keys.length && keys.every((k) => k.includes('.') || k.includes('(') || k.includes('\\'))) {
		return keys;
	}

	return [];
}

function looksLikeJsonList(payload: unknown): boolean {
	if (!payload || typeof payload !== 'object') return false;
	const o = payload as Record<string, unknown>;
	if (Array.isArray(o.data)) return true;
	if (o.data && typeof o.data === 'object') return true;
	if (o.success === true || o.success === false) return true;
	return normalizeListPayload(payload).length > 0;
}

export async function fetchPiholeList(
	fetchFn: typeof fetch,
	list: PiholeListKind
): Promise<PiholeListFetchResult> {
	const api = new URL(piholeAdminApiUrl());
	const token = piholeApiToken();
	if (token) api.searchParams.set('auth', token);
	api.searchParams.set('list', list);

	let upstream: Response;
	try {
		upstream = await fetchWithRetries(
			api.toString(),
			{ headers: { accept: 'application/json' } },
			{ attempts: 3 }
		);
	} catch (e: unknown) {
		return {
			ok: false,
			status: 0,
			entries: [],
			message: String((e as Error)?.message ?? e)
		};
	}

	const raw = await upstream.text();
	let payload: unknown = null;
	try {
		payload = raw ? JSON.parse(raw) : null;
	} catch {
		return {
			ok: false,
			status: upstream.status,
			entries: [],
			message: 'Pi-hole no devolvió JSON (¿URL o token incorrectos?)'
		};
	}

	if (!upstream.ok) {
		return {
			ok: false,
			status: upstream.status,
			entries: [],
			message: `Pi-hole HTTP ${upstream.status}`
		};
	}

	if (!looksLikeJsonList(payload)) {
		return {
			ok: false,
			status: upstream.status,
			entries: [],
			message: 'Respuesta de Pi-hole sin lista reconocible'
		};
	}

	const entries = normalizeListPayload(payload);
	return { ok: true, status: upstream.status, entries };
}

export function sortDomains(arr: string[]): string[] {
	return [...arr].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export async function fetchAllPiholeLists(fetchFn: typeof fetch): Promise<{
	blocked: { exact: string[]; wildcard: string[] };
	allowed: { exact: string[]; wildcard: string[] };
	errors: string[];
}> {
	const [black, regexBlack, white, regexWhite] = await Promise.all([
		fetchPiholeList(fetchFn, 'black'),
		fetchPiholeList(fetchFn, 'regex_black'),
		fetchPiholeList(fetchFn, 'white'),
		fetchPiholeList(fetchFn, 'regex_white')
	]);

	const errors: string[] = [];
	const note = (label: string, r: PiholeListFetchResult) => {
		if (!r.ok) errors.push(`${label}: ${r.message ?? `HTTP ${r.status}`}`);
	};

	note('Blacklist', black);
	note('Blacklist regex', regexBlack);
	note('Whitelist', white);
	note('Whitelist regex', regexWhite);

	const uniq = (arr: string[]) => Array.from(new Set(arr.map((x) => x.trim()).filter(Boolean)));

	return {
		blocked: {
			exact: sortDomains(uniq(black.ok ? black.entries : [])),
			wildcard: sortDomains(uniq(regexBlack.ok ? regexBlack.entries : []))
		},
		allowed: {
			exact: sortDomains(uniq(white.ok ? white.entries : [])),
			wildcard: sortDomains(uniq(regexWhite.ok ? regexWhite.entries : []))
		},
		errors
	};
}
