import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

export type InternetBlockRecord = {
	ip: string;
	label: string | null;
	client_key: string;
	groups_before: number[];
	pi_hole_group_id: number | null;
	blocked_at: string;
	blocked_by: string;
};

type Store = { blocks: InternetBlockRecord[] };

function storePath() {
	const base = env.INTERNET_BLOCKS_PATH?.trim() || path.join(process.cwd(), 'data', 'internet-blocks.json');
	return base;
}

function readStore(): Store {
	const p = storePath();
	try {
		if (!fs.existsSync(p)) return { blocks: [] };
		const raw = fs.readFileSync(p, 'utf-8');
		const j = JSON.parse(raw) as Store;
		if (!j || !Array.isArray(j.blocks)) return { blocks: [] };
		return j;
	} catch {
		return { blocks: [] };
	}
}

function writeStore(store: Store) {
	const p = storePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf-8');
}

export function listInternetBlocks(): InternetBlockRecord[] {
	return readStore().blocks;
}

export function getInternetBlock(ip: string): InternetBlockRecord | null {
	const norm = normalizeIp(ip);
	return readStore().blocks.find((b) => b.ip === norm) ?? null;
}

export function isInternetBlocked(ip: string): boolean {
	return getInternetBlock(ip) !== null;
}

export function normalizeIp(ip: string): string {
	return ip.trim();
}

export function isIpv4(ip: string): boolean {
	return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip.trim());
}

export function upsertInternetBlock(rec: InternetBlockRecord) {
	const store = readStore();
	const ip = normalizeIp(rec.ip);
	store.blocks = store.blocks.filter((b) => b.ip !== ip);
	store.blocks.push({ ...rec, ip });
	writeStore(store);
}

export function removeInternetBlock(ip: string): InternetBlockRecord | null {
	const store = readStore();
	const norm = normalizeIp(ip);
	const prev = store.blocks.find((b) => b.ip === norm) ?? null;
	store.blocks = store.blocks.filter((b) => b.ip !== norm);
	writeStore(store);
	return prev;
}

export function blockedIpSet(): Set<string> {
	return new Set(readStore().blocks.map((b) => b.ip));
}
