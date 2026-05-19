/**
 * Atajos de teclado globales del panel.
 *
 * Convenciones:
 *   - '/'   enfoca el primer buscador (`data-shortcut="search"`).
 *   - '?'   muestra el panel de ayuda.
 *   - 'Esc' cierra modales/ayuda.
 *   - Si el foco está en un input/textarea/contenteditable, los atajos NO se
 *     disparan (excepto Escape).
 */
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

export type Shortcut = {
	keys: string[];
	description: string;
	category: 'Navegación' | 'Acciones' | 'General';
	run: () => void;
};

const state = $state({ helpOpen: false });

export const shortcutsState = state;

function isEditable(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
	if (target.isContentEditable) return true;
	return false;
}

function focusFirstSearch() {
	const el =
		document.querySelector<HTMLInputElement>('[data-shortcut="search"]') ??
		document.querySelector<HTMLInputElement>('input[type="search"]') ??
		document.querySelector<HTMLInputElement>(
			'input[placeholder*="busca" i], input[placeholder*="filtra" i]'
		);
	if (el) {
		el.focus();
		el.select?.();
	}
}

export function shortcuts(): Shortcut[] {
	return [
		{
			keys: ['?'],
			description: 'Mostrar / ocultar esta ayuda',
			category: 'General',
			run: () => (state.helpOpen = !state.helpOpen)
		},
		{
			keys: ['/'],
			description: 'Enfocar el primer buscador de la página',
			category: 'General',
			run: focusFirstSearch
		},
		{ keys: ['h'], description: 'Ir al inicio', category: 'Navegación', run: () => goto('/') },
		{ keys: ['d'], description: 'Ir a DNS', category: 'Navegación', run: () => goto('/dns') },
		{ keys: ['u'], description: 'Ir a Usuarios', category: 'Navegación', run: () => goto('/users') },
		{ keys: ['s'], description: 'Ir a Estado', category: 'Navegación', run: () => goto('/status') },
		{ keys: ['a'], description: 'Ir a Auditoría', category: 'Navegación', run: () => goto('/audit') },
		{ keys: ['l'], description: 'Ir a Listas Pi-hole', category: 'Navegación', run: () => goto('/pihole/listas') },
		{ keys: ['b'], description: 'Ir a Bloqueos por IP', category: 'Navegación', run: () => goto('/pihole/bloqueos') },
		{ keys: ['g'], description: 'Ir a Seguridad', category: 'Navegación', run: () => goto('/seguridad') }
	];
}

export function closeHelp() {
	state.helpOpen = false;
}

export function installShortcuts(): () => void {
	if (!browser) return () => {};
	const list = shortcuts();
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') {
			state.helpOpen = false;
			return;
		}
		if (isEditable(e.target)) return;
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		const key = e.key;
		const match = list.find((s) => s.keys.includes(key));
		if (match) {
			e.preventDefault();
			match.run();
		}
	};
	document.addEventListener('keydown', onKey);
	return () => document.removeEventListener('keydown', onKey);
}
