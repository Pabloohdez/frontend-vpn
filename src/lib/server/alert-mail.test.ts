import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('alert-mail cooldown', () => {
	const tmp = path.join(os.tmpdir(), `alert-mail-test-${Date.now()}`);
	const stateFile = path.join(tmp, 'cooldown.json');

	beforeEach(() => {
		fs.mkdirSync(tmp, { recursive: true });
		vi.stubEnv('ALERT_MAIL_STATE_PATH', stateFile);
		vi.stubEnv('SMTP_HOST', '');
		vi.stubEnv('ALERT_EMAIL_TO', '');
	});

	afterEach(() => {
		vi.unstubAllEnvs();
		try {
			fs.rmSync(tmp, { recursive: true, force: true });
		} catch {
			/* ignore */
		}
	});

	it('shouldSendAlert allows first send then blocks', async () => {
		process.env.ALERT_MAIL_STATE_PATH = stateFile;
		process.env.ALERT_EMAIL_COOLDOWN_MIN = '30';
		vi.resetModules();
		const { shouldSendAlert } = await import('./alert-mail');
		expect(shouldSendAlert('test:key')).toBe(true);
		fs.writeFileSync(
			stateFile,
			JSON.stringify({ 'test:key': new Date().toISOString() }) + '\n',
			'utf8'
		);
		expect(shouldSendAlert('test:key')).toBe(false);
	});
});
