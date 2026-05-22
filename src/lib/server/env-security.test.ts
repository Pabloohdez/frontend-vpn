import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnvSecurityWarnings } from '$lib/server/env-security';

describe('env-security', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('avisa si SESSION_SECRET es corto', () => {
		vi.stubEnv('SESSION_SECRET', 'corta');
		const w = getEnvSecurityWarnings();
		expect(w.some((x) => x.id === 'session_secret_weak')).toBe(true);
	});

	it('avisa contraseña admin en claro', () => {
		vi.stubEnv('SESSION_SECRET', 'a'.repeat(32));
		vi.stubEnv('ADMIN_PASSWORD', 'secret');
		vi.stubEnv('ADMIN_PASSWORD_PBKDF2', '');
		const w = getEnvSecurityWarnings();
		expect(w.some((x) => x.id === 'admin_password_plain')).toBe(true);
	});
});
