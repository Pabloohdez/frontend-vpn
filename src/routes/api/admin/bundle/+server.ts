import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isAdminFromRequestCookie } from '$lib/server/auth';
import { writeAudit } from '$lib/server/audit';
import { writeCriticalAudit } from '$lib/server/audit-signed';
import { assertVm1Configured, fetchVm1, vm1ApiKey, vm1BundleUrlForCn } from '$lib/server/vm1';

export const GET: RequestHandler = async ({ request, fetch, url, getClientAddress }) => {
	if (!isAdminFromRequestCookie(request.headers.get('cookie'))) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}
	const cfg = assertVm1Configured();
	if (!cfg.ok) return json({ error: cfg.error }, { status: 500 });

	const cn = url.searchParams.get('cn');
	if (!cn) return json({ error: 'bad_request' }, { status: 400 });

	// Misma clave que el resto de admin de usuarios (X-Admin-Key); algunos despliegues de VM1 solo miran X-API-Key en rutas /admin/.
	const upstream = await fetchVm1(vm1BundleUrlForCn(cn), {
		headers: {
			'X-Admin-Key': vm1ApiKey(),
			'X-API-Key': vm1ApiKey()
		}
	});

	await writeAudit({
		ts: new Date().toISOString(),
		actor: 'admin',
		action: 'download_bundle',
		target_cn: cn,
		success: upstream.ok,
		remote_ip: getClientAddress(),
		details: { upstream_status: upstream.status }
	});
	try {
		await writeCriticalAudit({
			ts: new Date().toISOString(),
			actor: 'admin',
			action: 'download_bundle',
			target_cn: cn,
			success: upstream.ok,
			remote_ip: getClientAddress(),
			details: { upstream_status: upstream.status }
		});
	} catch {
		/* best-effort */
	}

	if (!upstream.ok) {
		const raw = await upstream.text().catch(() => '');
		let parsed: Record<string, unknown> = {};
		try {
			parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
		} catch {
			parsed = raw ? { detail: raw.slice(0, 800) } : {};
		}
		const st = upstream.status;
		const hint =
			st === 404
				? 'VM1 respondió 404: la ruta del bundle no existe o el CN no está en ese servidor. En VM2 puedes definir VPN_VM1_BUNDLE_PATH_TEMPLATE con la ruta real de VM1 (usa el marcador {cn}).'
				: st === 401 || st === 403
					? 'VM1 rechazó la clave (revisa VPN_API_KEY y que el bundle acepte X-Admin-Key o X-API-Key).'
					: undefined;
		return json(
			{
				...parsed,
				error: 'upstream_error',
				upstream_status: st,
				hint
			},
			{ status: 502, headers: { 'cache-control': 'no-store' } }
		);
	}

	// Passthrough del fichero
	const buf = new Uint8Array(await upstream.arrayBuffer());
	const filename =
		upstream.headers
			.get('content-disposition')
			?.match(/filename=\"?([^\";]+)\"?/i)?.[1] ?? `${cn}.zip`;
	return new Response(buf, {
		status: 200,
		headers: {
			'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
			'content-disposition': `attachment; filename="${filename}"`,
			'cache-control': 'no-store'
		}
	});
};

