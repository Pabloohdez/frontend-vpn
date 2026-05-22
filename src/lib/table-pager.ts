/** Utilidad de paginación para tablas en cliente. */

export function paginate<T>(items: T[], page: number, pageSize: number): { page: T[]; total: number; pages: number } {
	const total = items.length;
	const pages = Math.max(1, Math.ceil(total / pageSize));
	const p = Math.min(Math.max(1, page), pages);
	const start = (p - 1) * pageSize;
	return { page: items.slice(start, start + pageSize), total, pages };
}

export function filterRowsByQuery<T>(rows: T[], query: string, pick: (row: T) => string): T[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((r) => pick(r).toLowerCase().includes(q));
}
