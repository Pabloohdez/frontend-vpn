import { randomBytes, createHash } from 'node:crypto';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { getRedis } from '$lib/server/redis';
import type { AuthRole } from '$lib/server/auth';

export type SessionRecord = {
	role: AuthRole;
	created_at: number;
	last_seen_at: number;
};

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

function b64url(buf: Buffer) {
	return buf
		.toString('base64')
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
}

function sha256(s: string) {
	return createHash('sha256').update(s).digest('hex');
}

export function accessCookieName() {
	return 'panel_access';
}
export function refreshCookieName() {
	return 'panel_refresh';
}

export function cookieOpts(secure: boolean) {
	return {
		httpOnly: true as const,
		sameSite: 'lax' as const,
		secure,
		path: '/'
	};
}

export function newOpaqueToken(bytes = 32) {
	return b64url(randomBytes(bytes));
}

export async function createSession(role: AuthRole) {
	const redis = await getRedis();
	if (!redis) return null;

	const now = Date.now();
	const sid = newOpaqueToken(18);
	const access = newOpaqueToken(32);
	const refresh = newOpaqueToken(32);

	const rec: SessionRecord = { role, created_at: now, last_seen_at: now };
	await redis.set(`sess:${sid}`, JSON.stringify(rec), { EX: ACCESS_TTL_SEC });
	await redis.set(`acc:${sha256(access)}`, sid, { EX: ACCESS_TTL_SEC });
	await redis.set(`ref:${sha256(refresh)}`, sid, { EX: REFRESH_TTL_SEC });

	return { sid, access, refresh, access_ttl_sec: ACCESS_TTL_SEC, refresh_ttl_sec: REFRESH_TTL_SEC };
}

export async function getRoleFromAccessToken(token: string): Promise<AuthRole | null> {
	const redis = await getRedis();
	if (!redis) return null;
	const sid = await redis.get(`acc:${sha256(token)}`);
	if (!sid) return null;
	const raw = await redis.get(`sess:${sid}`);
	if (!raw) return null;
	try {
		const rec = JSON.parse(raw) as SessionRecord;
		if (!rec?.role) return null;
		// bump TTL best-effort
		void redis.expire(`sess:${sid}`, ACCESS_TTL_SEC);
		void redis.expire(`acc:${sha256(token)}`, ACCESS_TTL_SEC);
		return rec.role as AuthRole;
	} catch {
		return null;
	}
}

export async function rotateRefresh(refreshToken: string) {
	const redis = await getRedis();
	if (!redis) return null;
	const sid = await redis.get(`ref:${sha256(refreshToken)}`);
	if (!sid) return null;
	const raw = await redis.get(`sess:${sid}`);
	if (!raw) return null;

	let rec: SessionRecord | null = null;
	try {
		rec = JSON.parse(raw) as SessionRecord;
	} catch {
		rec = null;
	}
	if (!rec?.role) return null;

	const now = Date.now();
	rec.last_seen_at = now;
	const access = newOpaqueToken(32);
	const newRefresh = newOpaqueToken(32);

	// revoke old refresh
	await redis.del(`ref:${sha256(refreshToken)}`);
	await redis.set(`sess:${sid}`, JSON.stringify(rec), { EX: ACCESS_TTL_SEC });
	await redis.set(`acc:${sha256(access)}`, sid, { EX: ACCESS_TTL_SEC });
	await redis.set(`ref:${sha256(newRefresh)}`, sid, { EX: REFRESH_TTL_SEC });

	return { role: rec.role, access, refresh: newRefresh, access_ttl_sec: ACCESS_TTL_SEC, refresh_ttl_sec: REFRESH_TTL_SEC };
}

export async function revokeSessionByRefresh(refreshToken: string) {
	const redis = await getRedis();
	if (!redis) return false;
	const sid = await redis.get(`ref:${sha256(refreshToken)}`);
	if (!sid) return false;
	await redis.del(`ref:${sha256(refreshToken)}`);
	// Access tokens expiran solos; borramos sess para invalidar inmediatamente.
	await redis.del(`sess:${sid}`);
	return true;
}

export const safeEq = timingSafeEqualString;

