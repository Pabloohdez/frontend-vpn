import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';

function aliasPath() {
	// Reutilizamos el directorio del audit si existe, para no introducir otra variable.
	const audit = env.AUDIT_DB_PATH || '/app/data/audit.jsonl';
	return path.join(path.dirname(audit), 'user-aliases.json');
}

export type UserAliases = Record<string, string>; // cn -> alias

export function readAliases(): UserAliases {
	const p = aliasPath();
	if (!fs.existsSync(p)) return {};
	try {
		const raw = fs.readFileSync(p, 'utf-8');
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === 'object') return parsed as UserAliases;
		return {};
	} catch {
		return {};
	}
}

export function writeAliases(next: UserAliases) {
	const p = aliasPath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	fs.writeFileSync(p, JSON.stringify(next, null, 2), { encoding: 'utf-8' });
}

