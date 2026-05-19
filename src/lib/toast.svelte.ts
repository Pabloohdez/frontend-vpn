/**
 * Toast store ligero basado en Svelte 5 runes.
 *
 * Uso:
 *   import { toast } from '$lib/toast.svelte';
 *   toast.success('Listo');
 *   toast.error('Algo falló');
 *   toast.info('FYI');
 *   toast.warn('Cuidado', { ttl: 8000 });
 *
 * Renderiza una sola vez `<Toaster />` en el layout raíz.
 */
import { browser } from '$app/environment';

export type ToastKind = 'success' | 'error' | 'info' | 'warn';

export type ToastItem = {
	id: string;
	kind: ToastKind;
	message: string;
	title?: string;
	ttl: number;
	createdAt: number;
};

export type ToastOptions = {
	ttl?: number;
	title?: string;
};

const DEFAULT_TTL: Record<ToastKind, number> = {
	success: 3500,
	info: 4000,
	warn: 5500,
	error: 7000
};

class ToastStore {
	items = $state<ToastItem[]>([]);

	private push(kind: ToastKind, message: string, opts: ToastOptions = {}) {
		const id =
			browser && 'randomUUID' in crypto
				? crypto.randomUUID()
				: `t_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const ttl = Math.max(1500, opts.ttl ?? DEFAULT_TTL[kind]);
		const item: ToastItem = {
			id,
			kind,
			message,
			title: opts.title,
			ttl,
			createdAt: Date.now()
		};
		this.items = [...this.items, item];
		if (browser) {
			setTimeout(() => this.dismiss(id), ttl);
		}
		return id;
	}

	success(message: string, opts?: ToastOptions) {
		return this.push('success', message, opts);
	}
	error(message: string, opts?: ToastOptions) {
		return this.push('error', message, opts);
	}
	info(message: string, opts?: ToastOptions) {
		return this.push('info', message, opts);
	}
	warn(message: string, opts?: ToastOptions) {
		return this.push('warn', message, opts);
	}

	dismiss(id: string) {
		this.items = this.items.filter((t) => t.id !== id);
	}

	clear() {
		this.items = [];
	}
}

export const toast = new ToastStore();
