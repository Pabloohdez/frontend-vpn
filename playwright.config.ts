import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const projectRoot = path.dirname(fileURLToPath(import.meta.url));
const e2eDataDir = path.join(projectRoot, 'data', 'e2e-ci');

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
				command: `mkdir -p "${e2eDataDir}" && npm run build && npm run preview -- --host ${HOST} --port ${PORT}`,
				url: BASE_URL,
				reuseExistingServer: !process.env.CI,
				timeout: 120_000,
				stdout: 'pipe',
				stderr: 'pipe',
				env: {
					...process.env,
					SESSION_SECRET:
						process.env.SESSION_SECRET ?? 'ci_dummy_secret_minimum_32_chars_long',
					ADMIN_PASSWORD: process.env.ADMIN_PASSWORD ?? 'ci_admin',
					OPERATOR_PASSWORD: process.env.OPERATOR_PASSWORD ?? 'ci_operator',
					// E2E/CI: sin Pi-hole ni VM1; evita ticks que llamen APIs externas.
					PIHOLE_BASE_URL: process.env.PIHOLE_BASE_URL ?? '',
					VPN_API_BASE_URL: process.env.VPN_API_BASE_URL ?? '',
					VPN_API_KEY: process.env.VPN_API_KEY ?? '',
					AUDIT_DB_PATH: process.env.AUDIT_DB_PATH ?? path.join(e2eDataDir, 'audit.jsonl'),
					ADMIN_2FA_REQUIRED: process.env.ADMIN_2FA_REQUIRED ?? 'false'
				}
			}
});
