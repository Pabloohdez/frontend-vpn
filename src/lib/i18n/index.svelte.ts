/**
 * Store reactivo de i18n con persistencia en localStorage.
 *
 * Uso en componentes:
 *   import { i18n, t } from '$lib/i18n';
 *   <h1>{t('dashboard.title')}</h1>
 *   <button onclick={() => i18n.setLocale('en')}>EN</button>
 */
import { getMessage, LOCALES, type Locale } from './messages';

const STORAGE_KEY = 'app:locale';

function detectInitial(): Locale {
	if (typeof window === 'undefined') return 'es';
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (raw === 'es' || raw === 'en') return raw;
	} catch {
		/* ignore */
	}
	const nav = window.navigator?.language?.toLowerCase() ?? 'es';
	if (nav.startsWith('en')) return 'en';
	return 'es';
}

class I18nStore {
	locale = $state<Locale>('es');

	constructor() {
		this.locale = detectInitial();
	}

	setLocale(next: Locale) {
		if (!LOCALES.includes(next)) return;
		this.locale = next;
		if (typeof window !== 'undefined') {
			try {
				window.localStorage.setItem(STORAGE_KEY, next);
				document.documentElement.lang = next;
			} catch {
				/* ignore */
			}
		}
	}

	t(key: string, vars?: Record<string, string | number>): string {
		const raw = getMessage(this.locale, key);
		if (!vars) return raw;
		return raw.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
	}
}

export const i18n = new I18nStore();

/**
 * Helper directo: lee `i18n.locale` reactivamente para que cualquier componente
 * que llame `t(...)` se re-renderice al cambiar de idioma.
 */
export function t(key: string, vars?: Record<string, string | number>): string {
	void i18n.locale; // dependencia reactiva
	return i18n.t(key, vars);
}

export type { Locale };
