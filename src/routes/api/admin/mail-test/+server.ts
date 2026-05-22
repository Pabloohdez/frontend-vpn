import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { sendAlertEmail } from '$lib/server/alert-mail';

export const prerender = false;

export const POST: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const result = await sendAlertEmail({
		key: 'mail:test',
		subject: '[VPN Panel] Prueba de correo',
		text: `Correo de prueba enviado desde el panel.\nHora: ${new Date().toISOString()}`,
		force: true
	});

	if (!result.sent) {
		return json({ ok: false, ...result }, { status: result.skipped === 'mail_not_configured' ? 400 : 502 });
	}
	return json({ ok: true });
};
