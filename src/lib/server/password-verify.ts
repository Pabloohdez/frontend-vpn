import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const PBKDF2_DIGEST = 'sha256';
const PBKDF2_KEYLEN = 32;
const MIN_PBKDF2_ITERATIONS = 100_000;

/**
 * Formato: `saltHex:iterations:keyHex` (salt y key en hex, iterations entero).
 * Si el token es inválido devuelve `null` (no configurado / corrupto).
 */
export function verifyPbkdf2Token(password: string, token: string | undefined): boolean | null {
	const t = token?.trim();
	if (!t) return null;
	const parts = t.split(':');
	if (parts.length !== 3) return null;
	const [saltHex, iterStr, keyHex] = parts;
	const iterations = Number(iterStr);
	if (!Number.isFinite(iterations) || iterations < MIN_PBKDF2_ITERATIONS) return null;
	if (!/^[0-9a-fA-F]+$/.test(saltHex) || !/^[0-9a-fA-F]+$/.test(keyHex)) return null;
	if (saltHex.length < 16 || keyHex.length !== PBKDF2_KEYLEN * 2) return null;

	let salt: Buffer;
	let expected: Buffer;
	try {
		salt = Buffer.from(saltHex, 'hex');
		expected = Buffer.from(keyHex, 'hex');
	} catch {
		return null;
	}
	if (expected.length !== PBKDF2_KEYLEN) return null;

	const derived = pbkdf2Sync(password, salt, iterations, PBKDF2_KEYLEN, PBKDF2_DIGEST);
	try {
		return timingSafeEqual(derived, expected);
	} catch {
		return false;
	}
}
