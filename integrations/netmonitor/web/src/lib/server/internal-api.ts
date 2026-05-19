import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { timingSafeEqual } from 'node:crypto';

let cachedKey: string | null | undefined;

function parseEnvLine(line: string): string | null {
	const m = line.match(/^\s*INTERNAL_API_KEY\s*=\s*(.*)\s*$/);
	if (!m) return null;
	let v = m[1].trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	return v || null;
}

/** process.env (Docker) + web/.env (Vite/SvelteKit en dev). */
function internalApiKey(): string | undefined {
	if (cachedKey !== undefined) return cachedKey ?? undefined;

	let key = process.env.INTERNAL_API_KEY?.trim() || null;

	if (!key) {
		const envPath = resolve(process.cwd(), '.env');
		if (existsSync(envPath)) {
			try {
				const text = readFileSync(envPath, 'utf8');
				for (const line of text.split('\n')) {
					const v = parseEnvLine(line);
					if (v) {
						key = v;
						break;
					}
				}
			} catch {
				/* ignore */
			}
		}
	}

	cachedKey = key;
	return key ?? undefined;
}

export function isInternalApiConfigured(): boolean {
	return Boolean(internalApiKey());
}

function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) return false;
	return timingSafeEqual(ab, bb);
}

/** Bearer o header X-API-Key frente a INTERNAL_API_KEY. */
export function assertInternalApiKey(request: Request): boolean {
	const expected = internalApiKey();
	if (!expected) return false;

	const auth = request.headers.get('authorization');
	if (auth?.startsWith('Bearer ')) {
		const token = auth.slice(7).trim();
		if (token && safeEqual(token, expected)) return true;
	}

	const header = request.headers.get('x-api-key')?.trim();
	if (header && safeEqual(header, expected)) return true;

	return false;
}
