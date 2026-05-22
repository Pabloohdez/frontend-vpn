import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { enableTotp, verifyTotpSetup, totpStatus } from '$lib/server/totp';

export const prerender = false;

type Body = { code?: string };

export const POST: RequestHandler = async ({ request }) => {
	const authz = requirePermissionFromRequestCookie(request.headers.get('cookie'), 'openvpn_admin');
	if (!authz.ok) return json({ error: 'unauthorized' }, { status: 401 });

	const body = (await request.json().catch(() => null)) as Body | null;
	const code = String(body?.code ?? '').trim();
	if (!code) return json({ error: 'bad_request', message: 'code requerido' }, { status: 400 });

	// Durante setup, el state existe pero enabled=false; verificamos contra secreto guardado.
	const v = verifyTotpSetup(code);
	if (!v.ok) return json({ error: 'invalid_code' }, { status: 400 });

	try {
		enableTotp();
		return json({ ok: true, status: totpStatus() }, { headers: { 'cache-control': 'no-store' } });
	} catch (e: unknown) {
		const msg = String((e as Error)?.message ?? e);
		return json(
			{ error: 'storage_error', message: msg || 'No se pudo guardar el estado 2FA.' },
			{ status: 500, headers: { 'cache-control': 'no-store' } }
		);
	}
};

