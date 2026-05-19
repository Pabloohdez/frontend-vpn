import { piholeApiToken, piholeRootBaseUrl } from '$lib/server/pihole';

export type PiholeV6Session = { sid: string; csrf: string };

export async function piholeV6Login(fetchFn: typeof fetch): Promise<PiholeV6Session | null> {
	const password = piholeApiToken().trim();
	if (!password) return null;
	const url = `${piholeRootBaseUrl()}/api/auth`;
	const res = await fetchFn(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json', accept: 'application/json' },
		body: JSON.stringify({ password }),
		signal: AbortSignal.timeout(20_000)
	});
	if (!res.ok) return null;
	const j = (await res.json().catch(() => null)) as {
		session?: { sid?: string; csrf?: string };
	} | null;
	const sid = j?.session?.sid;
	const csrf = j?.session?.csrf;
	if (typeof sid !== 'string' || typeof csrf !== 'string') return null;
	return { sid, csrf };
}

export async function piholeV6Request(
	fetchFn: typeof fetch,
	method: string,
	path: string,
	opts?: { body?: unknown; session?: PiholeV6Session | null }
): Promise<{ ok: boolean; status: number; data: unknown }> {
	const session = opts?.session ?? (await piholeV6Login(fetchFn));
	if (!session) return { ok: false, status: 401, data: null };

	const url = `${piholeRootBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
	const res = await fetchFn(url, {
		method,
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
			'X-FTL-SID': session.sid,
			'X-FTL-CSRF': session.csrf
		},
		body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
		signal: AbortSignal.timeout(25_000)
	});

	const data = await res.json().catch(() => null);
	return { ok: res.ok, status: res.status, data };
}
