import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { requirePermissionFromRequestCookie } from '$lib/server/auth';
import { listInternetBlocks } from '$lib/server/internet-blocks-store';
import { listBlockSchedules } from '$lib/server/block-schedules-store';
import { readAliases } from '$lib/server/user-aliases';
import { readHiddenRevoked } from '$lib/server/revoked-hidden';
import { listAudit } from '$lib/server/audit';
import { rateLimitKey } from '$lib/server/rate-limit';

export const prerender = false;

/**
 * Export seguro (sin tokens ni .env) de datos locales del panel:
 * - Auditoría (últimos N eventos)
 * - Bloqueos por IP (panel)
 * - Horarios
 * - Alias de usuarios y revocados ocultos
 */
export const GET: RequestHandler = async ({ request, url, getClientAddress }) => {
	if (!requirePermissionFromRequestCookie(request.headers.get('cookie'), 'backup_export').ok) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	const rl = rateLimitKey('admin:backup_export', getClientAddress(), { windowMs: 60_000, maxPerWindow: 6 });
	if (!rl.ok) {
		return json(
			{ error: 'rate_limited', retryAfterSec: rl.retryAfterSec },
			{ status: 429, headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' } }
		);
	}

	const auditLimitRaw = Number(url.searchParams.get('audit_limit') ?? '2000');
	const auditLimit = Number.isFinite(auditLimitRaw) ? Math.min(Math.max(auditLimitRaw, 100), 20000) : 2000;

	const payload = {
		exported_at: new Date().toISOString(),
		audit: await listAudit({ limit: auditLimit }),
		internet_blocks: listInternetBlocks(),
		block_schedules: listBlockSchedules(),
		user_aliases: readAliases(),
		revoked_hidden: readHiddenRevoked()
	};

	return json(payload, {
		headers: {
			'cache-control': 'no-store',
			// para que el navegador lo trate como descarga
			'content-disposition': `attachment; filename="panel-backup-${new Date()
				.toISOString()
				.slice(0, 10)}.json"`
		}
	});
};

