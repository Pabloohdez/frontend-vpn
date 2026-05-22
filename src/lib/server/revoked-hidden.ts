import fs from 'node:fs';
import path from 'node:path';
import { resolveAuditDbPath } from '$lib/server/audit';

function hiddenPath() {
	const audit = resolveAuditDbPath();
	return path.join(path.dirname(audit), 'revoked-hidden.json');
}

export function readHiddenRevoked(): string[] {
	const p = hiddenPath();
	if (!fs.existsSync(p)) return [];
	try {
		const raw = fs.readFileSync(p, 'utf-8');
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0);
	} catch {
		return [];
	}
}

export function writeHiddenRevoked(cns: string[]) {
	const p = hiddenPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const uniq = [...new Set(cns)];
	fs.writeFileSync(p, JSON.stringify(uniq, null, 2), { encoding: 'utf-8' });
}

export function addHiddenRevoked(cn: string) {
	const next = new Set(readHiddenRevoked());
	next.add(cn);
	writeHiddenRevoked([...next]);
}

export function removeHiddenRevoked(cn: string) {
	const next = readHiddenRevoked().filter((x) => x !== cn);
	writeHiddenRevoked(next);
}
