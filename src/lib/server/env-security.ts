import { env } from '$env/dynamic/private';
import { SESSION_SECRET_MIN_LENGTH } from '$lib/server/auth';

export type EnvSecurityWarning = {
	id: string;
	severity: 'warn' | 'info';
	message: string;
};

function trim(name: keyof typeof env): string {
	const v = env[name] ?? process.env[String(name)];
	return typeof v === 'string' ? v.trim() : '';
}

/** Avisos rápidos del PDF §6 (sin exponer secretos). */
export function getEnvSecurityWarnings(): EnvSecurityWarning[] {
	const out: EnvSecurityWarning[] = [];
	const secret = trim('SESSION_SECRET');
	if (secret.length < SESSION_SECRET_MIN_LENGTH) {
		out.push({
			id: 'session_secret_weak',
			severity: 'warn',
			message: `SESSION_SECRET debe tener al menos ${SESSION_SECRET_MIN_LENGTH} caracteres (genera con: openssl rand -hex 32).`
		});
	}
	if (!trim('MASTER_KEY')) {
		out.push({
			id: 'master_key_missing',
			severity: 'warn',
			message:
				'MASTER_KEY no está definida; el 2FA y otros datos en reposo usan SESSION_SECRET como respaldo.'
		});
	}
	if (trim('ADMIN_PASSWORD') && !trim('ADMIN_PASSWORD_PBKDF2')) {
		out.push({
			id: 'admin_password_plain',
			severity: 'info',
			message:
				'ADMIN_PASSWORD está en texto plano; migra a ADMIN_PASSWORD_PBKDF2 (ver comentarios en .env.example).'
		});
	}
	if (!trim('CRON_SECRET')) {
		out.push({
			id: 'cron_secret_missing',
			severity: 'info',
			message: 'CRON_SECRET no configurado: los endpoints /api/cron/* quedarán deshabilitados.'
		});
	}
	return out;
}
