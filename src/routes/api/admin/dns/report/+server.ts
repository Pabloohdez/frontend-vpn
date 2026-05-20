import type { RequestHandler } from './$types';
import { getRoleFromEventCookies, isAuditorOrAdminFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { buildDnsDeviceReport, dayBoundsLocal, todayLocalIso } from '$lib/server/dns-device-report';
import { renderDnsDeviceReportPdf } from '$lib/server/dns-report-pdf';
import { mergeHostnameMapWithNetmonitor } from '$lib/server/device-resolve';
import { fetchNetmonitorIpMap } from '$lib/server/netmonitor';
import { assertPiholeConfigured } from '$lib/server/pihole';
import { fetchPiholeHostnameToIpv4Map, fetchPiholeQueryLog } from '$lib/server/pihole-query-log';
import { rateLimitKey } from '$lib/server/rate-limit';
import { writeCriticalAudit } from '$lib/server/audit-signed';

export const prerender = false;

const MAX_RANGE_SEC = 48 * 3600;

export const GET: RequestHandler = async ({ request, fetch, url, getClientAddress, cookies }) => {
	if (!isAuditorOrAdminFromRequestCookie(request.headers.get('cookie'))) {
		return new Response('No autorizado', { status: 401 });
	}

	const rl = rateLimitKey('report:dns_pdf', getClientAddress(), { windowMs: 60_000, maxPerWindow: 10 });
	if (!rl.ok) {
		return new Response(`Rate limited. Retry after ${rl.retryAfterSec}s`, {
			status: 429,
			headers: { 'Retry-After': String(rl.retryAfterSec), 'cache-control': 'no-store' }
		});
	}

	const cfg = assertPiholeConfigured();
	if (!cfg.ok) {
		return new Response('Pi-hole no configurado', { status: 500 });
	}

	const day = (url.searchParams.get('day') ?? todayLocalIso()).trim();
	const bounds = dayBoundsLocal(day);
	if (!bounds) {
		return new Response('Parámetro day inválido (use YYYY-MM-DD)', { status: 400 });
	}

	if (bounds.until - bounds.from > MAX_RANGE_SEC) {
		return new Response('Rango de día demasiado amplio', { status: 400 });
	}

	const clientFilter = url.searchParams.get('client')?.trim() || null;
	const maxQ = Math.min(800, Math.max(50, Number(url.searchParams.get('max') ?? 400) || 400));

	const { rows, piHoleReachable } = await fetchPiholeQueryLog(fetch, bounds.from, bounds.until);
	if (!piHoleReachable) {
		return new Response('No se pudo leer el log de Pi-hole', { status: 502 });
	}

	const [hostnameBase, netmonitor] = await Promise.all([
		fetchPiholeHostnameToIpv4Map(fetch),
		fetchNetmonitorIpMap(fetch)
	]);
	const hostnameToIpv4 = mergeHostnameMapWithNetmonitor(hostnameBase, netmonitor.map);

	const report = buildDnsDeviceReport({
		rows,
		day,
		hostnameToIpv4,
		netmonitorByIp: netmonitor.map,
		clientFilter,
		maxQueriesPerDevice: maxQ
	});

	const pdf = await renderDnsDeviceReportPdf(report);
	const safeDay = day.replace(/[^\d-]/g, '');
	const filename = clientFilter
		? `informe-dns-${safeDay}-filtrado.pdf`
		: `informe-dns-${safeDay}.pdf`;

	const role = getRoleFromEventCookies(cookies) ?? 'auditor';
	await writeAudit({
		ts: new Date().toISOString(),
		actor: role,
		action: 'dns_report_export',
		success: true,
		remote_ip: getClientAddress(),
		details: {
			day,
			client_filter: clientFilter,
			devices: report.devices.length,
			queries: rows.length
		}
	});
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: role,
			action: 'dns_report_export',
			success: true,
			remote_ip: getClientAddress(),
			details: { day, client_filter: clientFilter, devices: report.devices.length, queries: rows.length }
		});
	} catch {
		/* best-effort */
	}

	return new Response(new Uint8Array(pdf), {
		status: 200,
		headers: {
			'content-type': 'application/pdf',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};
