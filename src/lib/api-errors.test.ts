import { describe, expect, it } from 'vitest';
import { describeApiFailure, loginErrorMessage } from './api-errors';

describe('describeApiFailure', () => {
	it('marca 401 como needsAuth', () => {
		const f = describeApiFailure(401, null);
		expect(f.needsAuth).toBe(true);
		expect(f.message).toMatch(/sesión/i);
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
});
