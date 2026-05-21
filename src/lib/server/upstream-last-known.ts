import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

export type LastKnownStore = {
	vpn_health?: { at: string; data: unknown };
	pihole_health?: { at: string; data: unknown };
	vpn_status?: { at: string; data: unknown };
};

function filePath() {
	return (
		(env.UPSTREAM_LAST_KNOWN_PATH ?? '').trim() ||
		path.join(process.cwd(), 'data', 'upstream-last-known.json')
	);
}

function read(): LastKnownStore {
	const p = filePath();
	try {
		if (!fs.existsSync(p)) return {};
		return JSON.parse(fs.readFileSync(p, 'utf8')) as LastKnownStore;
	} catch {
		return {};
	}
}

function write(store: LastKnownStore) {
	const p = filePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

export function recordLastKnown(kind: keyof LastKnownStore, data: unknown) {
	const store = read();
	store[kind] = { at: new Date().toISOString(), data };
	write(store);
}

export function getLastKnown(kind: keyof LastKnownStore): { at: string; data: unknown } | null {
	const v = read()[kind];
	return v?.at ? v : null;
}
