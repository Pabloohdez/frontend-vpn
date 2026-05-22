import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { sendMail, readAlertRecipients, isMailConfigured } from '$lib/server/mail';

type CooldownStore = Record<string, string>;

function statePath() {
	return (
		(env.ALERT_MAIL_STATE_PATH ?? '').trim() ||
		path.join(process.cwd(), 'data', 'alert-mail-cooldown.json')
	);
}

function readCooldown(): CooldownStore {
	const p = statePath();
	try {
		if (!fs.existsSync(p)) return {};
		return JSON.parse(fs.readFileSync(p, 'utf8')) as CooldownStore;
	} catch {
		return {};
	}
}

function writeCooldown(store: CooldownStore) {
	const p = statePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

function cooldownMinutes(): number {
	const n = Number(env.ALERT_EMAIL_COOLDOWN_MIN ?? 30);
	return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}

/** Evita spam: una alerta por `key` cada N minutos. */
export function shouldSendAlert(key: string): boolean {
	const store = readCooldown();
	const last = store[key];
	if (!last) return true;
	const ms = cooldownMinutes() * 60_000;
	return Date.now() - Date.parse(last) >= ms;
}

function markSent(key: string) {
	const store = readCooldown();
	store[key] = new Date().toISOString();
	writeCooldown(store);
}

export async function sendAlertEmail(opts: {
	key: string;
	subject: string;
	text: string;
	force?: boolean;
}): Promise<{ sent: boolean; skipped?: string; error?: string }> {
	if (!isMailConfigured()) {
		return { sent: false, skipped: 'mail_not_configured' };
	}
	if (!opts.force && !shouldSendAlert(opts.key)) {
		return { sent: false, skipped: 'cooldown' };
	}

	const to = readAlertRecipients();
	const result = await sendMail({ to, subject: opts.subject, text: opts.text });
	if (!result.ok) {
		return { sent: false, error: result.error };
	}
	markSent(opts.key);
	return { sent: true };
}

export async function notifyWatchdogFailure(checks: Record<string, { ok: boolean; detail?: string }>) {
	const failed = Object.entries(checks).filter(([, c]) => !c.ok);
	if (!failed.length) return { sent: false, skipped: 'all_ok' };

	const lines = failed.map(([k, c]) => `- ${k}: ${c.detail ?? 'error'}`);
	const text = [
		'El watchdog del panel VPN detectó servicios caídos:',
		'',
		...lines,
		'',
		`Hora: ${new Date().toISOString()}`,
		'Panel: fronted-vpn'
	].join('\n');

	return sendAlertEmail({
		key: `watchdog:${failed.map(([k]) => k).sort().join(',')}`,
		subject: `[VPN Panel] Watchdog: ${failed.map(([k]) => k).join(', ')} caído`,
		text
	});
}

export async function notifySecurityCritical(opts: {
	criticalCount: number;
	alertTitles: string[];
	windowHours: number;
}) {
	if (opts.criticalCount <= 0) {
		return { sent: false, skipped: 'no_critical' };
	}

	const preview = opts.alertTitles.slice(0, 8).map((t) => `- ${t}`).join('\n');
	const text = [
		`Se detectaron ${opts.criticalCount} alerta(s) crítica(s) en las últimas ${opts.windowHours} h:`,
		'',
		preview || '(sin detalle)',
		opts.alertTitles.length > 8 ? `\n… y ${opts.alertTitles.length - 8} más` : '',
		'',
		`Hora: ${new Date().toISOString()}`,
		'Revisa: /seguridad en el panel.'
	].join('\n');

	return sendAlertEmail({
		key: `security:critical:${opts.windowHours}`,
		subject: `[VPN Panel] ${opts.criticalCount} alerta(s) crítica(s) DNS/seguridad`,
		text
	});
}
