import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { notifySecurityCritical } from '$lib/server/alert-mail';
import { collectSecurityInsights } from '$lib/server/security-insights-collect';

export const prerender = false;

function assertCronSecret(request: Request): boolean {
	const expected = (env.CRON_SECRET ?? '').trim();
	if (!expected) return false;
	const got =
		request.headers.get('x-cron-secret')?.trim() ||
		new URL(request.url).searchParams.get('secret')?.trim() ||
		'';
	return got.length > 0 && timingSafeEqualString(got, expected);
}

/** Envía email si hay alertas críticas (logins, DNS anómalo, tunelización, etc.). */
export const POST: RequestHandler = async ({ request, fetch }) => {
	if (!assertCronSecret(request)) {
		return json({ error: 'forbidden' }, { status: 403 });
	}

	if ((env.ALERT_EMAIL_SECURITY ?? 'true').trim() === 'false') {
		return json({ ok: true, skipped: 'security_alerts_disabled' });
	}

	const windowHours = Math.min(168, Math.max(1, Number(env.ALERT_EMAIL_WINDOW_HOURS ?? 24) || 24));
	const auditDays = Math.max(1, Math.ceil(windowHours / 24));
	const insights = await collectSecurityInsights(fetch, windowHours, auditDays);
	const critical = insights.alerts.filter((a) => a.severity === 'critical');
	const mail = await notifySecurityCritical({
		criticalCount: critical.length,
		alertTitles: critical.map((a) => a.title),
		windowHours
	});

	return json({
		ok: true,
		critical_count: critical.length,
		alert_ids: critical.map((a) => a.id),
		dns_anomalies: insights.anomalies.length,
		dns_threats: insights.threats.length,
		mail
	});
};
