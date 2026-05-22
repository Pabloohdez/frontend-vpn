/** Líneas de cron recomendadas (PDF §1.4, §4.1) — sin secretos reales. */

export type CronHint = {
	id: string;
	label: string;
	schedule: string;
	path: string;
	note?: string;
};

export function buildCronHints(
	baseUrl = 'http://127.0.0.1:2346',
	secretPlaceholder = 'TU_CRON_SECRET'
): CronHint[] {
	void baseUrl;
	void secretPlaceholder;
	return [
		{
			id: 'data-backup',
			label: 'Backup diario de data/',
			schedule: '0 2 * * *',
			path: '/api/cron/data-backup',
			note: 'Alternativa: scripts/backup-data.sh en el host'
		},
		{
			id: 'watchdog',
			label: 'Watchdog VM1 y Pi-hole',
			schedule: '*/5 * * * *',
			path: '/api/cron/watchdog'
		},
		{
			id: 'security-alerts',
			label: 'Alertas de seguridad por email',
			schedule: '0 * * * *',
			path: '/api/cron/security-alerts'
		},
		{
			id: 'dns-history',
			label: 'Histórico DNS horario',
			schedule: '5 * * * *',
			path: '/api/cron/dns-history?max_hours=48'
		}
	];
}

export function cronCurlLine(hint: CronHint, baseUrl: string, secret: string): string {
	const url = `${baseUrl.replace(/\/$/, '')}${hint.path}`;
	return `curl -fsS -X POST -H "X-Cron-Secret: ${secret}" ${url}`;
}

export function cronCrontabLines(baseUrl: string, secretPlaceholder: string): string[] {
	return buildCronHints(baseUrl, secretPlaceholder).map((h) => {
		const url = `${baseUrl.replace(/\/$/, '')}${h.path}`;
		return `${h.schedule} curl -fsS -X POST -H "X-Cron-Secret: ${secretPlaceholder}" ${url}`;
	});
}
