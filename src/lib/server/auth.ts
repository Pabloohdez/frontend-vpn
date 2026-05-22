import { createHmac } from 'node:crypto';
import { timingSafeEqualString } from '$lib/server/crypto-utils';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import { env } from '$env/dynamic/private';
import { verifyPbkdf2Token } from '$lib/server/password-verify';
import { hasPanelUsers, verifyPanelUser } from '$lib/server/panel-users-store';
import { accessCookieName, getRoleFromAccessToken } from '$lib/server/session-store';
import type { Permission } from '$lib/server/permissions';
import { hasPermission as checkPermission, hasStaffReadAccess } from '$lib/server/permissions';

export const COOKIE_NAME = 'admin_session';

/** Debe coincidir con maxAge de la cookie de sesión. */
export const SESSION_MAX_MS = 60 * 60 * 12 * 1000;

/** Longitud mínima recomendada para SESSION_SECRET (bytes UTF-8). */
export const SESSION_SECRET_MIN_LENGTH = 32;

/** Longitud máxima aceptada en login (mitiga cuerpos enormes). */
export const MAX_LOGIN_PASSWORD_LENGTH = 512;

export type { AuthRole, Permission } from '$lib/server/permissions';
export { hasPermission, hasStaffReadAccess, listPermissionsForRole } from '$lib/server/permissions';
import type { AuthRole } from '$lib/server/permissions';

function envTrim(name: keyof typeof env): string {
	// Fallback a process.env: en adapter-node a veces private_env y el entorno del contenedor divergen.
	const v = env[name] ?? process.env[String(name)];
	return typeof v === 'string' ? v.trim() : '';
}

function hmac(input: string) {
	const secret = envTrim('SESSION_SECRET');
	return createHmac('sha256', secret).update(input).digest('hex');
}

function sessionSecretOk() {
	return envTrim('SESSION_SECRET').length >= SESSION_SECRET_MIN_LENGTH;
}

function hasAdminCredential() {
	return Boolean(envTrim('ADMIN_PASSWORD_PBKDF2') || envTrim('ADMIN_PASSWORD'));
}

function hasAuditorCredential() {
	return Boolean(envTrim('AUDITOR_PASSWORD_PBKDF2') || envTrim('AUDITOR_PASSWORD'));
}

function hasOperatorCredential() {
	return Boolean(envTrim('OPERATOR_PASSWORD_PBKDF2') || envTrim('OPERATOR_PASSWORD'));
}

export function isAuthConfigured() {
	return Boolean(
		sessionSecretOk() &&
			(hasPanelUsers() || hasAdminCredential() || hasAuditorCredential() || hasOperatorCredential())
	);
}

/**
 * Cookie `Secure` solo si está explícito o la URL es HTTPS real.
 * No usamos `X-Forwarded-Proto` por defecto: en LAN con HTTP (ej. 192.0.2.x) un proxy
 * que envía `https` haría que el navegador rechace la cookie y el login fallaría.
 */
export function shouldUseSecureCookies(request: Request): boolean {
	const v = envTrim('COOKIE_SECURE');
	if (v === 'true' || v === '1' || v === 'yes') return true;
	if (v === 'false' || v === '0' || v === 'no') return false;

	const trustProxy = envTrim('TRUST_PROXY').toLowerCase();
	if (trustProxy === 'true' || trustProxy === '1') {
		const xf = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
		if (xf === 'https') return true;
	}

	try {
		return new URL(request.url).protocol === 'https:';
	} catch {
		return false;
	}
}

export function buildSessionCookieValue(role: AuthRole): string {
	const issuedAt = Date.now().toString();
	const payload = `${issuedAt}.${role}`;
	const sig = hmac(payload);
	return `${issuedAt}.${role}.${sig}`;
}

export function sessionCookieOptions(request: Request) {
	return {
		httpOnly: true as const,
		sameSite: 'lax' as const,
		secure: shouldUseSecureCookies(request),
		path: '/',
		maxAge: Math.floor(SESSION_MAX_MS / 1000)
	};
}

export function makeSessionCookie(role: AuthRole, request: Request) {
	return serializeCookie(COOKIE_NAME, buildSessionCookieValue(role), sessionCookieOptions(request));
}

export function clearSessionCookie(request: Request) {
	const secure = shouldUseSecureCookies(request);
	return serializeCookie(COOKIE_NAME, '', {
		httpOnly: true,
		sameSite: 'lax',
		secure,
		path: '/',
		maxAge: 0
	});
}

export function isAdminFromRequestCookie(cookieHeader: string | null | undefined) {
	return getRoleFromRequestCookie(cookieHeader) === 'admin';
}

/** Usuarios definidos en `.env` con nombres fijos (compatibilidad). */
function verifyEnvUsernamePassword(username: string, password: string): AuthRole | null {
	if (password.length > MAX_LOGIN_PASSWORD_LENGTH) return null;
	const u = username.trim().toLowerCase();

	if (u === 'admin') {
		const pbkdfAdmin = (env.ADMIN_PASSWORD_PBKDF2 ?? '').trim();
		if (pbkdfAdmin) {
			const r = verifyPbkdf2Token(password, pbkdfAdmin);
			return r === true ? 'admin' : null;
		}
		const admin = envTrim('ADMIN_PASSWORD');
		if (admin && timingSafeEqualString(password, admin)) return 'admin';
		return null;
	}

	if (u === 'operator') {
		const pbkdfOp = (env.OPERATOR_PASSWORD_PBKDF2 ?? '').trim();
		if (pbkdfOp) {
			const r = verifyPbkdf2Token(password, pbkdfOp);
			return r === true ? 'operator' : null;
		}
		const operator = envTrim('OPERATOR_PASSWORD');
		if (operator && timingSafeEqualString(password, operator)) return 'operator';
		return null;
	}

	if (u === 'auditor') {
		const pbkdfAud = (env.AUDITOR_PASSWORD_PBKDF2 ?? '').trim();
		if (pbkdfAud) {
			const r = verifyPbkdf2Token(password, pbkdfAud);
			return r === true ? 'auditor' : null;
		}
		const auditor = envTrim('AUDITOR_PASSWORD');
		if (auditor && timingSafeEqualString(password, auditor)) return 'auditor';
		return null;
	}

	return null;
}

/** Login con usuario + contraseña (cuentas del panel o `.env` legacy). */
export function verifyCredentials(username: string | undefined, password: string): AuthRole | null {
	if (password.length > MAX_LOGIN_PASSWORD_LENGTH) return null;
	const u = username?.trim();
	if (u) {
		const fromPanel = verifyPanelUser(u, password);
		if (fromPanel) return fromPanel;
		return verifyEnvUsernamePassword(u, password);
	}
	return verifyPasswordAndGetRole(password);
}

/** Solo contraseña: prueba cada rol en `.env` (sin usuario). */
export function verifyPasswordAndGetRole(password: string): AuthRole | null {
	if (password.length > MAX_LOGIN_PASSWORD_LENGTH) return null;

	const pbkdfAdmin = (env.ADMIN_PASSWORD_PBKDF2 ?? '').trim();
	if (pbkdfAdmin) {
		const r = verifyPbkdf2Token(password, pbkdfAdmin);
		if (r === true) return 'admin';
		return null;
	}
	const admin = envTrim('ADMIN_PASSWORD');
	if (admin && timingSafeEqualString(password, admin)) return 'admin';

	// Operator (opcional): puede operar pero no administrar OpenVPN.
	const pbkdfOp = (env.OPERATOR_PASSWORD_PBKDF2 ?? '').trim();
	if (pbkdfOp) {
		const r = verifyPbkdf2Token(password, pbkdfOp);
		if (r === true) return 'operator';
		return null;
	}
	const operator = envTrim('OPERATOR_PASSWORD');
	if (operator && timingSafeEqualString(password, operator)) return 'operator';

	const pbkdfAud = (env.AUDITOR_PASSWORD_PBKDF2 ?? '').trim();
	if (pbkdfAud) {
		const r = verifyPbkdf2Token(password, pbkdfAud);
		if (r === true) return 'auditor';
		return null;
	}
	const auditor = envTrim('AUDITOR_PASSWORD');
	if (auditor && timingSafeEqualString(password, auditor)) return 'auditor';
	return null;
}

function roleFromSessionValue(raw: string | undefined | null): AuthRole | null {
	if (!isAuthConfigured() || !raw) return null;

	const [issuedAt, role, sig] = raw.split('.', 3);
	if (!issuedAt || !role || !sig) return null;
	if (role !== 'admin' && role !== 'operator' && role !== 'auditor') return null;

	const issuedMs = Number(issuedAt);
	if (!Number.isFinite(issuedMs) || Date.now() - issuedMs > SESSION_MAX_MS) return null;

	const payload = `${issuedAt}.${role}`;
	const expected = hmac(payload);
	return timingSafeEqualString(sig, expected) ? (role as AuthRole) : null;
}

export function requirePermissionFromRequestCookie(
	cookieHeader: string | null | undefined,
	perm: Permission
): { ok: true; role: AuthRole } | { ok: false } {
	const role = getRoleFromRequestCookie(cookieHeader);
	return checkPermission(role, perm) && role ? { ok: true, role } : { ok: false };
}

export function getRoleFromRequestCookie(cookieHeader: string | null | undefined): AuthRole | null {
	if (!cookieHeader) return null;
	const cookies = parseCookie(cookieHeader);
	// Nueva sesión Redis (si existe cookie access)
	const access = cookies[accessCookieName()];
	// NOTA: esta función es sync; para Redis usamos getRoleFromEventCookies async en handlers.
	// Aquí solo dejamos compatibilidad antigua.
	return roleFromSessionValue(cookies[COOKIE_NAME]);
}

export function getRoleFromEventCookies(cookies: {
	get: (name: string) => string | undefined;
}): AuthRole | null {
	return roleFromSessionValue(cookies.get(COOKIE_NAME));
}

export async function getRoleFromEventCookiesAsync(event: {
	cookies: { get: (name: string) => string | undefined };
}): Promise<AuthRole | null> {
	const legacy = roleFromSessionValue(event.cookies.get(COOKIE_NAME));
	if (legacy) return legacy;
	const access = event.cookies.get(accessCookieName());
	if (!access) return null;
	return await getRoleFromAccessToken(access);
}

/** @deprecated Usa `isStaffFromRequestCookie` (incluye operador). */
export function isAuditorOrAdminFromRequestCookie(cookieHeader: string | null | undefined) {
	return isStaffFromRequestCookie(cookieHeader);
}

/** Admin, operador o auditor: lectura de monitorización (DNS, dashboard, auditoría). */
export function isStaffFromRequestCookie(cookieHeader: string | null | undefined) {
	return hasStaffReadAccess(getRoleFromRequestCookie(cookieHeader));
}

/** Epoch ms en que caduca la sesión (solo si la cookie es válida). */
export function getSessionExpiresAtMs(cookieHeader: string | null | undefined): number | null {
	const role = getRoleFromRequestCookie(cookieHeader);
	if (!role) return null;

	const cookies = parseCookie(cookieHeader ?? '');
	const v = cookies[COOKIE_NAME];
	if (!v) return null;

	const [issuedAt] = v.split('.', 3);
	const t = Number(issuedAt);
	if (!Number.isFinite(t)) return null;
	return t + SESSION_MAX_MS;
}

