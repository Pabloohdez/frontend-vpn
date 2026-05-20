import { listInternetBlocks } from '$lib/server/internet-blocks-store';
import { fetchNetmonitorIpMap, type NetmonitorDevice } from '$lib/server/netmonitor';
import { extractFirstIpv4, readPrunedIpCnHistory } from '$lib/server/vpn-ipcn-history';
import { assertVm1Configured, fetchVm1, vm1ApiKey, vm1BaseUrl } from '$lib/server/vm1';
import { isScheduleBlockedRecord, SCHEDULE_BLOCKED_BY_PREFIX } from '$lib/server/block-schedules-store';

export type NetworkDeviceRow = {
	ip: string;
	label: string;
	hostname: string | null;
	mac: string | null;
	type: string | null;
	sede_name: string;
	online: boolean;
	blocked: boolean;
	blocked_at: string | null;
	blocked_by: string | null;
	blocked_source: 'manual' | 'schedule' | null;
	block_schedule_id: string | null;
	vpn_cn: string | null;
	vpn_connected: boolean;
	in_netmonitor: boolean;
};

export type NetworkDevicesPayload = {
	configured: boolean;
	reachable: boolean;
	vpn_configured: boolean;
	devices: NetworkDeviceRow[];
};

type VpnClientLite = {
	cn?: unknown;
	common_name?: unknown;
	virtual_address?: unknown;
	real_address?: unknown;
	real_ip?: unknown;
};

async function vpnLanIndex(fetchFn: typeof fetch): Promise<{
	lan_to_cn: Map<string, string>;
	connected_lan: Set<string>;
}> {
	const lan_to_cn = new Map<string, string>();
	const connected_lan = new Set<string>();

	for (const [, v] of Object.entries(readPrunedIpCnHistory())) {
		if (v.real_lan && v.cn) lan_to_cn.set(v.real_lan, v.cn);
	}

	if (!assertVm1Configured().ok) {
		return { lan_to_cn, connected_lan };
	}

	try {
		const res = await fetchVm1(`${vm1BaseUrl().replace(/\/$/, '')}/api/v1/status`, {
			headers: { 'X-API-Key': vm1ApiKey() },
			signal: AbortSignal.timeout(12_000)
		});
		if (!res.ok) return { lan_to_cn, connected_lan };

		const data = (await res.json()) as { connected_clients?: VpnClientLite[] };
		for (const c of data.connected_clients ?? []) {
			const cn =
				(typeof c.cn === 'string' && c.cn.trim()) ||
				(typeof c.common_name === 'string' && c.common_name.trim()) ||
				'';
			if (!cn) continue;
			const lan =
				extractFirstIpv4(c.real_address) ??
				extractFirstIpv4(c.real_ip) ??
				null;
			if (lan) {
				lan_to_cn.set(lan, cn);
				connected_lan.add(lan);
			}
		}
	} catch {
		/* best-effort */
	}

	return { lan_to_cn, connected_lan };
}

function rowFromNetmonitor(
	dev: NetmonitorDevice,
	block: ReturnType<typeof listInternetBlocks>[number] | undefined,
	vpn: { lan_to_cn: Map<string, string>; connected_lan: Set<string> }
): NetworkDeviceRow {
	const cn = vpn.lan_to_cn.get(dev.ip) ?? null;
	const isSched = block ? isScheduleBlockedRecord(block.blocked_by) : false;
	const scheduleId =
		block && isSched ? block.blocked_by.slice(SCHEDULE_BLOCKED_BY_PREFIX.length) : null;
	return {
		ip: dev.ip,
		label: dev.label,
		hostname: dev.hostname,
		mac: dev.mac,
		type: dev.type,
		sede_name: dev.sedeName,
		online: dev.online,
		blocked: Boolean(block),
		blocked_at: block?.blocked_at ?? null,
		blocked_by: block?.blocked_by ?? null,
		blocked_source: block ? (isSched ? 'schedule' : 'manual') : null,
		block_schedule_id: scheduleId,
		vpn_cn: cn,
		vpn_connected: vpn.connected_lan.has(dev.ip),
		in_netmonitor: true
	};
}

function rowFromBlock(
	block: ReturnType<typeof listInternetBlocks>[number],
	vpn: { lan_to_cn: Map<string, string>; connected_lan: Set<string> }
): NetworkDeviceRow {
	const cn = vpn.lan_to_cn.get(block.ip) ?? null;
	const isSched = isScheduleBlockedRecord(block.blocked_by);
	const scheduleId = isSched ? block.blocked_by.slice(SCHEDULE_BLOCKED_BY_PREFIX.length) : null;
	return {
		ip: block.ip,
		label: block.label?.trim() || block.ip,
		hostname: null,
		mac: null,
		type: null,
		sede_name: '',
		online: false,
		blocked: true,
		blocked_at: block.blocked_at,
		blocked_by: block.blocked_by,
		blocked_source: isSched ? 'schedule' : 'manual',
		block_schedule_id: scheduleId,
		vpn_cn: cn,
		vpn_connected: vpn.connected_lan.has(block.ip),
		in_netmonitor: false
	};
}

export async function buildNetworkDevicesList(fetchFn: typeof fetch): Promise<NetworkDevicesPayload> {
	const [netmonitor, blocks, vpn] = await Promise.all([
		fetchNetmonitorIpMap(fetchFn),
		Promise.resolve(listInternetBlocks()),
		vpnLanIndex(fetchFn)
	]);

	const blockByIp = new Map(blocks.map((b) => [b.ip, b]));
	const rows: NetworkDeviceRow[] = [];
	const seen = new Set<string>();

	for (const dev of Object.values(netmonitor.map)) {
		seen.add(dev.ip);
		rows.push(rowFromNetmonitor(dev, blockByIp.get(dev.ip), vpn));
	}

	for (const block of blocks) {
		if (seen.has(block.ip)) continue;
		rows.push(rowFromBlock(block, vpn));
	}

	rows.sort((a, b) => {
		if (a.blocked !== b.blocked) return a.blocked ? -1 : 1;
		if (a.online !== b.online) return a.online ? -1 : 1;
		return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
	});

	return {
		configured: netmonitor.configured,
		reachable: netmonitor.reachable,
		vpn_configured: assertVm1Configured().ok,
		devices: rows
	};
}
