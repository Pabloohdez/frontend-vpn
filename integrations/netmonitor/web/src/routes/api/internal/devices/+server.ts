import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { assertInternalApiKey } from '$lib/server/internal-api';
import { listAllDevices } from '$lib/server/sites';

export const prerender = false;

export const GET: RequestHandler = async ({ request }) => {
	if (!assertInternalApiKey(request)) {
		return json({ error: 'unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
	}

	const rows = await listAllDevices({});
	const by_ip: Record<
		string,
		{
			id: number;
			ip: string;
			mac: string | null;
			hostname: string | null;
			customName: string | null;
			type: string | null;
			manufacturer: string | null;
			os: string | null;
			sedeId: number;
			sedeName: string;
			sedeColor: string | null;
			online: boolean;
			lastSeen: string | null;
		}
	> = {};

	for (const d of rows) {
		by_ip[d.ip] = {
			id: d.id,
			ip: d.ip,
			mac: d.mac,
			hostname: d.hostname,
			customName: d.customName,
			type: d.type,
			manufacturer: d.manufacturer,
			os: d.os,
			sedeId: d.sedeId,
			sedeName: d.sedeName,
			sedeColor: d.sedeColor,
			online: d.online,
			lastSeen: d.lastSeen ? d.lastSeen.toISOString() : null
		};
	}

	return json(
		{
			updated_at: new Date().toISOString(),
			count: rows.length,
			by_ip
		},
		{ status: 200, headers: { 'cache-control': 'no-store' } }
	);
};
