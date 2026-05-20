import { browser } from '$app/environment';

/** URL de login con retorno a la ruta actual. */
export function loginHref(nextPath?: string): string {
	if (!browser) return '/login';
	const next = nextPath ?? window.location.pathname + window.location.search;
	return `/login?next=${encodeURIComponent(next)}`;
}

export function isUnauthorizedStatus(status: number): boolean {
	return status === 401 || status === 403;
}

export function unauthorizedMessage(status: number): string {
	if (status === 403) return 'No tienes permisos para esta acción.';
	return 'Necesitas iniciar sesión como administrador, operador o auditor.';
}
