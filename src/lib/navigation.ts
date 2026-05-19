export type AppSection = 'hub' | 'openvpn' | 'pihole' | 'settings' | 'audit' | 'other';

const OPENVPN_PATHS = ['/openvpn', '/status', '/users'];
const PIHOLE_PATHS = ['/pihole', '/dns', '/seguridad', '/pihole/bloqueos', '/dashboard'];
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

import type { MessageKey } from '$lib/i18n/messages';

export type NavLinkDef = { href: string; labelKey: MessageKey };

export const openvpnLinks: readonly NavLinkDef[] = [
	{ href: '/openvpn', labelKey: 'nav.openvpn.dashboard' },
	{ href: '/status', labelKey: 'nav.openvpn.status' },
	{ href: '/users', labelKey: 'nav.openvpn.users' }
] as const;

export const piholeLinks: readonly NavLinkDef[] = [
	{ href: '/pihole', labelKey: 'nav.pihole.summary' },
	{ href: '/dashboard', labelKey: 'nav.pihole.dashboard' },
	{ href: '/dns', labelKey: 'nav.pihole.dns' },
	{ href: '/pihole/listas', labelKey: 'nav.pihole.lists' },
	{ href: '/pihole/bloqueos', labelKey: 'nav.pihole.devices' },
	{ href: '/seguridad', labelKey: 'nav.pihole.security' }
] as const;

/** Visible en todas las secciones (OpenVPN, Pi-hole, auditoría, ajustes). */
export const globalNavLinks: readonly NavLinkDef[] = [{ href: '/audit', labelKey: 'nav.audit' }] as const;
