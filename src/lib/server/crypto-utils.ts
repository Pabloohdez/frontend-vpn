import { timingSafeEqual } from 'node:crypto';

/** Comparación segura de strings UTF-8 (longitudes distintas → false). */
export function timingSafeEqualString(a: string, b: string): boolean {
	const ba = Buffer.from(a, 'utf8');
	const bb = Buffer.from(b, 'utf8');
	if (ba.length !== bb.length) return false;
	try {
		return timingSafeEqual(ba, bb);
	} catch {
		return false;
	}
}
