/**
 * Reintentos breves ante 502/503/504 o fallos de red (timeouts, ECONNRESET).
 */
export async function fetchWithRetries(
	url: string,
	init?: RequestInit,
	opts?: { attempts?: number }
): Promise<Response> {
	const attempts = Math.min(Math.max(opts?.attempts ?? 3, 1), 6);
	let last: Response | undefined;
	let lastNetErr: unknown;

	for (let i = 0; i < attempts; i++) {
		if (i > 0) await new Promise((r) => setTimeout(r, 120 * Math.pow(2, i - 1)));
		try {
			const res = await fetch(url, init);
			last = res;
			if (res.ok) return res;
			const retryable = res.status >= 502 && res.status <= 504;
			if (retryable && i < attempts - 1) continue;
			return res;
		} catch (e) {
			lastNetErr = e;
			if (i === attempts - 1) break;
		}
	}

	if (last) return last;

	return new Response(
		JSON.stringify({
			error: 'upstream_unreachable',
			message: lastNetErr ? String(lastNetErr) : 'fetch_failed'
		}),
		{ status: 502, headers: { 'content-type': 'application/json' } }
	);
}
