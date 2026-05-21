import { log } from '$lib/server/log';
import {
	isScheduleBlockedRecord,
	listBlockSchedules,
	migrateBlockSchedule,
	scheduleActiveNow,
	SCHEDULE_BLOCKED_BY_PREFIX
} from '$lib/server/block-schedules-store';
import { getInternetBlock, listInternetBlocks } from '$lib/server/internet-blocks-store';
import { blockInternetForIp, unblockInternetForIp } from '$lib/server/pihole-internet-block';
import { resolveTargetIps } from '$lib/server/policy-target';
import { readPrunedIpCnHistory, refreshIpCnHistoryBestEffort } from '$lib/server/vpn-ipcn-history';

let lastTick = 0;
let ticking = false;

const TICK_MS = 60_000;

/**
 * Aplica horarios: bloquea IPs dentro de ventana y desbloquea las que salieron
 * si el bloqueo lo impuso el programador (blocked_by = schedule:<id>).
 */
export async function tickBlockSchedules(fetchFn: typeof fetch, force = false): Promise<void> {
	const now = Date.now();
	if (!force && now - lastTick < TICK_MS) return;
	if (ticking) return;
	ticking = true;
	lastTick = now;
	try {
		const schedules = listBlockSchedules().filter((s) => s.enabled);
		if (schedules.length === 0) return;

		await refreshIpCnHistoryBestEffort(fetchFn);
		const history = readPrunedIpCnHistory();

		const activeByIp = new Map<string, string>(); // ip -> scheduleId
		for (const s of schedules) {
			if (!scheduleActiveNow(s)) continue;
			const migrated = migrateBlockSchedule(s);
			for (const ip of resolveTargetIps(migrated, history)) {
				activeByIp.set(ip, migrated.id);
			}
		}

		for (const [ip, scheduleId] of activeByIp) {
			const existing = getInternetBlock(ip);
			if (existing) continue;
			const label = schedules.find((x) => x.id === scheduleId)?.label ?? null;
			const res = await blockInternetForIp(fetchFn, ip, {
				label,
				actor: `${SCHEDULE_BLOCKED_BY_PREFIX}${scheduleId}`
			});
			if (res.ok) {
				log.info('schedule.block_applied', { ip, scheduleId });
			} else {
				log.warn('schedule.block_failed', { ip, scheduleId, message: res.message });
			}
		}

		for (const rec of listInternetBlocks()) {
			if (!isScheduleBlockedRecord(rec.blocked_by)) continue;
			const scheduleId = rec.blocked_by.slice(SCHEDULE_BLOCKED_BY_PREFIX.length);
			const stillActive = activeByIp.get(rec.ip) === scheduleId;
			if (stillActive) continue;
			const res = await unblockInternetForIp(fetchFn, rec.ip);
			if (res.ok) log.info('schedule.unblock_applied', { ip: rec.ip, scheduleId });
			else log.warn('schedule.unblock_failed', { ip: rec.ip, scheduleId, message: res.message });
		}
	} catch (e) {
		log.error('schedule.tick_error', {
			error: e instanceof Error ? e.message : String(e)
		});
	} finally {
		ticking = false;
	}
}
