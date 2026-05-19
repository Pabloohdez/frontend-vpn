import { browser } from '$app/environment';
import { messages, type Locale, type MessageKey } from './messages';

const STORAGE_KEY = 'panel-locale';

function readInitial(): Locale {
	if (!browser) return 'es';
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		if (v === 'en' || v === 'es') return v;
	} catch {
		/* ignore */
	}
	if (browser && navigator.language?.toLowerCase().startsWith('en')) return 'en';
	return 'es';
}

class LocaleState {
	locale = $state<Locale>(readInitial());

	set(next: Locale) {
		this.locale = next;
		if (browser) {
			try {
				localStorage.setItem(STORAGE_KEY, next);
			} catch {
				/* ignore */
			}
			document.documentElement.lang = next;
		}
	}

	t(key: MessageKey, vars?: Record<string, string | number>): string {
		let s = messages[this.locale][key] ?? messages.es[key] ?? key;
		if (vars) {
			for (const [k, v] of Object.entries(vars)) {
				s = s.replaceAll(`{${k}}`, String(v));
			}
		}
		return s;
	}
}

export const i18n = new LocaleState();

/** Atajo en componentes Svelte (reactivo al cambiar idioma). */
export function t(key: MessageKey, vars?: Record<string, string | number>) {
	void i18n.locale;
	return i18n.t(key, vars);
}
