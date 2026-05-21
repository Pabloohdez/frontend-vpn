import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
	createPanelUser,
	verifyPanelUser,
	deletePanelUser,
	listPanelUsersPublic
} from './panel-users-store';

describe('panel-users-store', () => {
	let tmpDir = '';

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-users-'));
		process.env.PANEL_USERS_PATH = path.join(tmpDir, 'panel-users.json');
	});

	afterEach(() => {
		if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
		delete process.env.PANEL_USERS_PATH;
	});

	it('crea y verifica usuario', () => {
		createPanelUser({ username: 'test.ops', password: 'secret123', role: 'operator' });
		expect(verifyPanelUser('test.ops', 'secret123')).toBe('operator');
		expect(verifyPanelUser('test.ops', 'wrong')).toBeNull();
		expect(listPanelUsersPublic()).toHaveLength(1);
	});

	it('no elimina el último admin', () => {
		const a = createPanelUser({ username: 'solo', password: 'adminpass1', role: 'admin' });
		expect(() => deletePanelUser(a.id)).toThrow(/administrador/);
	});
});
