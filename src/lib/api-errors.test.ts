import { describe, expect, it } from 'vitest';
import { describeApiFailure, loginErrorMessage } from './api-errors';

describe('describeApiFailure', () => {
	it('marca 401 como needsAuth', () => {
		const f = describeApiFailure(401, null);
		expect(f.needsAuth).toBe(true);
		expect(f.message).toMatch(/sesión/i);
	});

	it('403 CSRF no pide login', () => {
		const f = describeApiFailure(403, { message: 'CSRF inválido' });
		expect(f.needsAuth).toBe(false);
		expect(f.message).toMatch(/CSRF/i);
	});

	it('formatea rate_limited con segundos', () => {
		const f = describeApiFailure(429, { error: 'rate_limited', retryAfterSec: 42 });
		expect(f.rateLimited).toBe(true);
		expect(f.retryAfterSec).toBe(42);
		expect(f.message).toMatch(/42/);
	});

	it('formatea locked en login', () => {
		const msg = loginErrorMessage(429, { error: 'locked', retryAfterSec: 120 });
		expect(msg).toMatch(/120/);
	});

	it('incluye hint y código HTTP del panel', () => {
		const f = describeApiFailure(502, {
			hint: 'Revisa VM1',
			message: 'Bundle no disponible',
			upstream_status: 503
		});
		expect(f.message).toMatch(/Revisa VM1/);
		expect(f.message).toMatch(/502/);
	});

	it('añade upstream_status si el mensaje no menciona VM1', () => {
		const f = describeApiFailure(502, {
			message: 'Bundle no disponible',
			upstream_status: 503
		});
		expect(f.message).toMatch(/503/);
	});
});
