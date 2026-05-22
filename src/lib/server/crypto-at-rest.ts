import { createDecipheriv, createCipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

function keyBytes(): Buffer {
	const raw = (env.MASTER_KEY ?? process.env.MASTER_KEY ?? '').trim();
	if (raw) {
		try {
			if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, 'hex');
		} catch {
			/* ignore */
		}
		return createHash('sha256').update(raw, 'utf8').digest();
	}

	// Sin MASTER_KEY: derivar de SESSION_SECRET (mín. 32) para que 2FA y auditoría firmada funcionen en LAN.
	const session = (env.SESSION_SECRET ?? process.env.SESSION_SECRET ?? '').trim();
	if (session.length >= 32) {
		return createHash('sha256').update(`totp-at-rest:${session}`, 'utf8').digest();
	}

	throw new Error('MASTER_KEY_or_SESSION_SECRET_missing');
}

export function encryptJson(obj: unknown): { v: 1; iv: string; ct: string; tag: string } {
	const key = keyBytes();
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
	const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
	const tag = cipher.getAuthTag();
	return { v: 1, iv: iv.toString('base64'), ct: ct.toString('base64'), tag: tag.toString('base64') };
}

export function decryptJson(payload: { v: 1; iv: string; ct: string; tag: string }): unknown {
	const key = keyBytes();
	const iv = Buffer.from(payload.iv, 'base64');
	const ct = Buffer.from(payload.ct, 'base64');
	const tag = Buffer.from(payload.tag, 'base64');
	const decipher = createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
	return JSON.parse(pt.toString('utf8'));
}

