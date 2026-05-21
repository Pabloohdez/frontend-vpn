import { expect, test } from '@playwright/test';

function parseCsrfToken(setCookie: string | undefined): string | null {
	if (!setCookie) return null;
	const m = /csrf_token=([^;]+)/.exec(setCookie);
	return m ? decodeURIComponent(m[1]) : null;
}

test.describe('CSRF', () => {
	test('POST sin token devuelve csrf_invalid', async ({ request }) => {
		const res = await request.post('/api/admin/categories', {
			headers: { 'content-type': 'application/json' },
			data: { type: 'domains', category_id: 'social', domains: ['example.com'] }
		});
		expect(res.status()).toBe(403);
		const j = await res.json();
		expect(j.error).toBe('csrf_invalid');
	});

	test('POST con cookie CSRF pero sin sesión no es error CSRF', async ({ request }) => {
		const home = await request.get('/');
		const token = parseCsrfToken(home.headers()['set-cookie']);
		expect(token).toBeTruthy();

		const res = await request.post('/api/admin/categories', {
			headers: {
				'content-type': 'application/json',
				'x-csrf-token': token!,
				cookie: `csrf_token=${encodeURIComponent(token!)}`
			},
			data: { type: 'domains', category_id: 'social', domains: [] }
		});
		expect(res.status()).toBe(401);
		const j = await res.json();
		expect(j.error).not.toBe('csrf_invalid');
	});
});

test.describe('roles', () => {
	test('operador no puede crear usuarios VPN', async ({ page, request }) => {
		const opPw = process.env.E2E_OPERATOR_PASSWORD ?? process.env.OPERATOR_PASSWORD ?? '';
		test.skip(!opPw, 'E2E_OPERATOR_PASSWORD no configurada');

		await page.goto('/login');
		await page.locator('input[autocomplete="username"]').fill('operator');
		await page.locator('#ovpn-login-pw, input[type="password"]').first().fill(opPw);
		await page.getByRole('button', { name: /entrar|iniciar/i }).click();
		await page.waitForLoadState('networkidle');

		const home = await request.get('/');
		const token = parseCsrfToken(home.headers()['set-cookie']);
		const cookies = await page.context().cookies();
		const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');

		const res = await request.post('/api/admin/users', {
			headers: {
				'content-type': 'application/json',
				'x-csrf-token': token ?? '',
				cookie: cookieHeader
			},
			data: { cn: 'e2e-test-user', days_valid: 1 }
		});
		expect(res.status()).toBe(401);
	});

	test('admin expone permisos en /api/auth/me', async ({ page, request }) => {
		const pw = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';
		test.skip(!pw, 'E2E_ADMIN_PASSWORD no configurada');

		await page.goto('/login');
		await page.locator('input[autocomplete="username"]').fill('admin');
		await page.locator('input[type="password"]').first().fill(pw);
		await page.getByRole('button', { name: /entrar|iniciar/i }).click();
		await page.waitForLoadState('networkidle');

		const me = await request.get('/api/auth/me');
		expect(me.ok()).toBeTruthy();
		const j = (await me.json()) as { permissions?: string[]; role?: string };
		expect(j.role).toBe('admin');
		expect(j.permissions).toContain('vpn_write');
		expect(j.permissions).toContain('backup_export');
	});
});
