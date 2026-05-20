import fs from 'node:fs';
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { decryptJson, encryptJson } from '$lib/server/crypto-at-rest';

type TOTPState = {
	enabled: boolean;
	secret_base32: string;
	recovery_codes: string[]; // hashed? (en v1 guardamos en claro pero cifrado at-rest)
	created_at: string;
};

function filePath() {
	const base = env.TOTP_STATE_PATH?.trim() || path.join(process.cwd(), 'data', 'totp.json');
	return base;
}

export function readTotpState(): TOTPState | null {
	const p = filePath();
	if (!fs.existsSync(p)) return null;
	try {
		const raw = JSON.parse(fs.readFileSync(p, 'utf8')) as any;
		if (!raw || typeof raw !== 'object') return null;
		const dec = decryptJson(raw);
		return dec as TOTPState;
	} catch {
		return null;
	}
}

export function writeTotpState(state: TOTPState) {
	const p = filePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const enc = encryptJson(state);
	fs.writeFileSync(p, JSON.stringify(enc, null, 2) + '\n', 'utf8');
}

