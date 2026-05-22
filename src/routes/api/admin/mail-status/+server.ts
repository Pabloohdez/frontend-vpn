import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { isMailConfigured, readAlertRecipients, readMailConfig } from '$lib/server/mail';
import { env } from '$env/dynamic/private';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const cfg = readMailConfig();
	return json({
		configured: isMailConfigured(),
		host: cfg?.host ?? null,
		port: cfg?.port ?? null,
		from: cfg?.from ?? null,
		recipients_count: readAlertRecipients().length,
		cooldown_min: Number(env.ALERT_EMAIL_COOLDOWN_MIN ?? 30) || 30,
		security_alerts_enabled: (env.ALERT_EMAIL_SECURITY ?? 'true').trim() !== 'false'
	});
};
