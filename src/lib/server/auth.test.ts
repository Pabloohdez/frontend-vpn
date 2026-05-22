import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAuthConfigured, verifyCredentials } from '$lib/server/auth';

describe('auth', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('verifyCredentials admin con usuario y contraseña .env', () => {
		vi.stubEnv('SESSION_SECRET', 'x'.repeat(40));
		vi.stubEnv('ADMIN_PASSWORD', 'clave-admin');
		vi.stubEnv('ADMIN_PASSWORD_PBKDF2', '');
		expect(verifyCredentials('admin', 'clave-admin')).toBe('admin');
		expect(verifyCredentials('admin', 'mala')).toBeNull();
	});

	it('isAuthConfigured exige SESSION_SECRET largo', () => {
		vi.stubEnv('SESSION_SECRET', 'corta');
		vi.stubEnv('ADMIN_PASSWORD', 'x');
		expect(isAuthConfigured()).toBe(false);
		vi.stubEnv('SESSION_SECRET', 'x'.repeat(40));
		expect(isAuthConfigured()).toBe(true);
	});
});
