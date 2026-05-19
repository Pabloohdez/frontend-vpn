/**
 * Filtros guardados por sección (persistidos en localStorage).
 *
 * Cada filtro es un objeto plano serializable a JSON. La sección es la clave
 * (p. ej. "dns", "audit") para evitar colisiones entre páginas.
 */
import { browser } from '$app/environment';

const STORAGE_PREFIX = 'fronted-vpn:savedFilters:';

export type SavedFilter<T = Record<string, unknown>> = {
	id: string;
	name: string;
	createdAt: string;
	updatedAt: string;
	data: T;
};

function storageKey(section: string) {
	return STORAGE_PREFIX + section;
}

function read<T>(section: string): SavedFilter<T>[] {
	if (!browser) return [];
	try {
		const raw = localStorage.getItem(storageKey(section));
		if (!raw) return [];
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed as SavedFilter<T>[];
	} catch {
		return [];
	}
}

function write<T>(section: string, list: SavedFilter<T>[]) {
	if (!browser) return;
	try {
		localStorage.setItem(storageKey(section), JSON.stringify(list));
	} catch {
		// best-effort: cuota llena, modo privado, etc.
	}
}

function makeId(): string {
	if (browser && 'randomUUID' in crypto) return crypto.randomUUID();
	return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function listSavedFilters<T>(section: string): SavedFilter<T>[] {
	return read<T>(section).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function saveFilter<T>(section: string, name: string, data: T): SavedFilter<T> {
	const trimmed = name.trim();
	if (!trimmed) throw new Error('Nombre vacío');
	const list = read<T>(section);
	const now = new Date().toISOString();
	const existing = list.find((f) => f.name === trimmed);
	if (existing) {
		existing.data = data;
		existing.updatedAt = now;
		write(section, list);
		return existing;
	}
	const item: SavedFilter<T> = {
		id: makeId(),
		name: trimmed,
		data,
		createdAt: now,
		updatedAt: now
	};
	write(section, [...list, item]);
	return item;
}

export function deleteSavedFilter(section: string, id: string) {
	const list = read(section).filter((f) => f.id !== id);
	write(section, list);
}

export function renameSavedFilter(section: string, id: string, newName: string) {
	const list = read(section);
	const item = list.find((f) => f.id === id);
	if (!item) return;
	item.name = newName.trim() || item.name;
	item.updatedAt = new Date().toISOString();
	write(section, list);
}
