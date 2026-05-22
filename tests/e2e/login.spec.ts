import { expect, test } from '@playwright/test';

function cookieHeader(cookies: { name: string; value: string }[]): string {
	return cookies.map((c) => `${c.name}=${c.value}`).join('; ');
}

/**
 * Smoke E2E mínimo: verifica que la app arranca, que la página de login está
 * accesible (puede ser `/login` o redirigir desde `/`), y que cargar una
 * ruta protegida sin sesión devuelve 401/redirect y nunca rompe la app.
 *
 * No depende de Pi-hole ni de Netmonitor (puede correr en CI sin esos).
 */
test.describe('smoke', () => {
	test('home loads without server errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(String(err)));
		const res = await page.goto('/');
		expect(res?.ok() || (res?.status() ?? 0) < 500).toBeTruthy();
		await expect(page.locator('html')).toBeVisible();
		expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
	});

	test('protected API requires auth', async ({ request }) => {
		const res = await request.get('/api/admin/security-insights?window_hours=1');
		// Sin cookie => 401 ó redirección a login. Nunca 5xx.
		expect([401, 403, 302, 303, 307]).toContain(res.status());
	});

	test('dashboard route renders without JS errors', async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (err) => errors.push(String(err)));
		await page.goto('/dashboard');
		// O bien muestra el dashboard o bien pide login: ambos OK, lo que no queremos es crash.
		await expect(page.locator('body')).toBeVisible();
		expect(errors, `Console errors: ${errors.join('\n')}`).toEqual([]);
	});

	test('login as admin enables privileged API', async ({ page, request }) => {
		const pw = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';
		// Si no hay password en el entorno, no tiene sentido fallar el pipeline.
		test.skip(!pw, 'E2E_ADMIN_PASSWORD/ADMIN_PASSWORD no configurada');

		await page.goto('/login');
		await page.locator('input[autocomplete="username"]').fill('admin');
		await page.locator('input[type="password"]').first().fill(pw);
		await page.getByRole('button', { name: /entrar|iniciar/i }).click();
		await page.waitForLoadState('networkidle');

		const cookies = await page.context().cookies();
		const hdr = { cookie: cookieHeader(cookies) };

		const me = await request.get('/api/auth/me', { headers: { ...hdr, 'cache-control': 'no-cache' } });
		expect(me.ok()).toBeTruthy();
		const meJson = (await me.json()) as { role?: string | null; isAdmin?: boolean };
		expect(meJson.role).toBe('admin');
		expect(meJson.isAdmin).toBe(true);

		// Endpoint protegido (admin/auditor) debe dejar pasar tras login.
		const sec = await request.get('/api/admin/security-insights?window_hours=1', { headers: hdr });
		expect([200, 502, 500]).toContain(sec.status()); // 502/500 aceptable si Pi-hole no está en CI
	});
});
