import { expect, test } from '@playwright/test';

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
});
