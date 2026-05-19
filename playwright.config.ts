import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4173);
const HOST = process.env.E2E_HOST ?? '127.0.0.1';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://${HOST}:${PORT}`;

export default defineConfig({
	testDir: 'tests/e2e',
	timeout: 30_000,
	fullyParallel: false,
	retries: process.env.CI ? 2 : 0,
	reporter: process.env.CI ? [['github'], ['list']] : 'list',
	use: {
		baseURL: BASE_URL,
		trace: 'on-first-retry',
		screenshot: 'only-on-failure'
	},
	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] }
		}
	],
	// Reuse el servidor si ya hay uno en marcha (dev local); en CI lo levanta él mismo.
	webServer: process.env.E2E_SKIP_WEB_SERVER
		? undefined
		: {
				command: `npm run build && npm run preview -- --host ${HOST} --port ${PORT}`,
				url: BASE_URL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
				stdout: 'pipe',
				stderr: 'pipe'
			}
});
