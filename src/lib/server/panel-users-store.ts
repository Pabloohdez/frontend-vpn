import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '$env/dynamic/private';
import type { AuthRole } from '$lib/server/auth';
import { createPbkdf2Token, verifyPbkdf2Token } from '$lib/server/password-verify';

export type PanelUser = {
	id: string;
	username: string;
	role: AuthRole;
	password_pbkdf2: string;
	enabled: boolean;
	created_at: string;
	updated_at: string;
};

export type PanelUserPublic = Omit<PanelUser, 'password_pbkdf2'>;

type Store = { users: PanelUser[] };

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,32}$/;

function storePath() {
	return env.PANEL_USERS_PATH?.trim() || path.join(process.cwd(), 'data', 'panel-users.json');
}

function readStore(): Store {
	const p = storePath();
	try {
		if (!fs.existsSync(p)) return { users: [] };
		const raw = fs.readFileSync(p, 'utf-8');
		const j = JSON.parse(raw) as Store;
		if (!j || !Array.isArray(j.users)) return { users: [] };
		return j;
	} catch {
		return { users: [] };
	}
}

function writeStore(store: Store) {
	const p = storePath();
	fs.mkdirSync(path.dirname(p), { recursive: true });
	const tmp = `${p}.tmp`;
	fs.writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf-8');
	fs.renameSync(tmp, p);
}

export function listPanelUsersPublic(): PanelUserPublic[] {
	return readStore().users.map(({ password_pbkdf2: _, ...u }) => u);
}

export function hasPanelUsers(): boolean {
	return readStore().users.some((u) => u.enabled);
}

function findByUsername(username: string): PanelUser | null {
	const norm = username.trim().toLowerCase();
	return readStore().users.find((u) => u.username.toLowerCase() === norm) ?? null;
}

export function verifyPanelUser(username: string, password: string): AuthRole | null {
	const u = findByUsername(username);
	if (!u || !u.enabled) return null;
	const ok = verifyPbkdf2Token(password, u.password_pbkdf2);
	return ok === true ? u.role : null;
}

export function validateUsername(username: string): string | null {
	const t = username.trim();
	if (!USERNAME_RE.test(t)) {
		return 'Usuario: 3–32 caracteres, solo letras, números, . _ -';
	}
	return null;
}

export function validateNewPassword(password: string): string | null {
	if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
	if (password.length > 512) return 'Contraseña demasiado larga.';
	return null;
}

function countEnabledAdmins(users: PanelUser[], excludeId?: string) {
	return users.filter((u) => u.role === 'admin' && u.enabled && u.id !== excludeId).length;
}

export type CreatePanelUserInput = {
	username: string;
	password: string;
	role: AuthRole;
};

export function createPanelUser(input: CreatePanelUserInput): PanelUserPublic {
	const userErr = validateUsername(input.username);
	if (userErr) throw new Error(userErr);
	const passErr = validateNewPassword(input.password);
	if (passErr) throw new Error(passErr);
	if (input.role !== 'admin' && input.role !== 'operator' && input.role !== 'auditor') {
		throw new Error('Rol inválido');
	}

	const store = readStore();
	const norm = input.username.trim().toLowerCase();
	if (store.users.some((u) => u.username.toLowerCase() === norm)) {
		throw new Error('Ese nombre de usuario ya existe');
	}

	const now = new Date().toISOString();
	const user: PanelUser = {
		id: randomUUID(),
		username: input.username.trim(),
		role: input.role,
		password_pbkdf2: createPbkdf2Token(input.password),
		enabled: true,
		created_at: now,
		updated_at: now
	};
	store.users.push(user);
	writeStore(store);
	const { password_pbkdf2: _, ...pub } = user;
	return pub;
}

export type UpdatePanelUserInput = {
	id: string;
	username?: string;
	password?: string;
	role?: AuthRole;
	enabled?: boolean;
};

export function updatePanelUser(input: UpdatePanelUserInput): PanelUserPublic {
	const store = readStore();
	const idx = store.users.findIndex((u) => u.id === input.id);
	if (idx < 0) throw new Error('Usuario no encontrado');

	const cur = store.users[idx];
	const nextRole = input.role ?? cur.role;
	if (nextRole !== 'admin' && nextRole !== 'operator' && nextRole !== 'auditor') {
		throw new Error('Rol inválido');
	}

	const willEnable = input.enabled !== undefined ? input.enabled : cur.enabled;
	if (cur.role === 'admin' && (!willEnable || nextRole !== 'admin')) {
		if (countEnabledAdmins(store.users, cur.id) < 1) {
			throw new Error('Debe quedar al menos un administrador activo');
		}
	}
	if (nextRole !== 'admin' && cur.role === 'admin' && willEnable) {
		if (countEnabledAdmins(store.users, cur.id) < 1) {
			throw new Error('Debe quedar al menos un administrador activo');
		}
	}

	if (input.username !== undefined) {
		const userErr = validateUsername(input.username);
		if (userErr) throw new Error(userErr);
		const norm = input.username.trim().toLowerCase();
		if (store.users.some((u) => u.id !== cur.id && u.username.toLowerCase() === norm)) {
			throw new Error('Ese nombre de usuario ya existe');
		}
		cur.username = input.username.trim();
	}

	if (input.password !== undefined && input.password.length > 0) {
		const passErr = validateNewPassword(input.password);
		if (passErr) throw new Error(passErr);
		cur.password_pbkdf2 = createPbkdf2Token(input.password);
	}

	cur.role = nextRole;
	if (input.enabled !== undefined) cur.enabled = input.enabled;
	cur.updated_at = new Date().toISOString();

	store.users[idx] = cur;
	writeStore(store);
	const { password_pbkdf2: _, ...pub } = cur;
	return pub;
}

export function deletePanelUser(id: string): void {
	const store = readStore();
	const u = store.users.find((x) => x.id === id);
	if (!u) throw new Error('Usuario no encontrado');
	if (u.role === 'admin' && u.enabled && countEnabledAdmins(store.users, u.id) < 1) {
		throw new Error('No se puede eliminar el último administrador activo');
	}
	store.users = store.users.filter((x) => x.id !== id);
	writeStore(store);
}
