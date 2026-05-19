export type AppSection = 'hub' | 'openvpn' | 'pihole' | 'settings' | 'audit' | 'other';

const OPENVPN_PATHS = ['/openvpn', '/status', '/users'];
const PIHOLE_PATHS = ['/pihole', '/dns', '/seguridad', '/pihole/bloqueos'];
const AUDIT_PATHS = ['/audit'];

export function getAppSection(pathname: string): AppSection {
	if (pathname === '/' || pathname === '') return 'hub';
	if (pathname === '/ajustes' || pathname.startsWith('/ajustes/')) return 'settings';
	if (AUDIT_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'audit';
	if (OPENVPN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'openvpn';
	if (PIHOLE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return 'pihole';
	return 'other';
}

/** Rutas «hub» con subpáginas propias en la barra: solo activas en coincidencia exacta. */
const EXACT_MATCH_HREFS = new Set(['/pihole', '/openvpn']);

export function isActivePath(pathname: string, href: string): boolean {
	if (href === '/') return pathname === '/';
	if (pathname === href) return true;
	if (EXACT_MATCH_HREFS.has(href)) return false;
	return pathname.startsWith(`${href}/`);
}

export const openvpnLinks = [
	{ href: '/openvpn', label: 'Dashboard' },
	{ href: '/status', label: 'Estado' },
	{ href: '/users', label: 'Usuarios' }
] as const;

export const piholeLinks = [
	{ href: '/pihole', label: 'Resumen' },
	{ href: '/dns', label: 'DNS' },
	{ href: '/pihole/listas', label: 'Listas' },
	{ href: '/pihole/bloqueos', label: 'Dispositivos' },
	{ href: '/seguridad', label: 'Seguridad' }
] as const;

/** Visible en todas las secciones (OpenVPN, Pi-hole, auditoría, ajustes). */
export const globalNavLinks = [{ href: '/audit', label: 'Auditoría' }] as const;
