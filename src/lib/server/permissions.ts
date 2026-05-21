export type AuthRole = 'admin' | 'operator' | 'auditor';

/** Permisos comprobados en APIs del panel. */
export type Permission =
	| 'read'
	| 'pihole_write'
	| 'internet_block_write'
	| 'block_schedules_write'
	| 'openvpn_admin'
	| 'backup_export'
	| 'vpn_read'
	| 'vpn_write';

const OPERATOR_PERMS: Permission[] = [
	'read',
	'pihole_write',
	'internet_block_write',
	'block_schedules_write',
	'vpn_read'
];

const AUDITOR_PERMS: Permission[] = ['read', 'vpn_read'];

/** Etiquetas para documentación / UI. */
export const PERMISSION_LABELS: Record<Permission, string> = {
	read: 'Lectura general (ajustes, categorías, threat intel estado)',
	pihole_write: 'Editar listas y dominios Pi-hole',
	internet_block_write: 'Bloquear / desbloquear internet por IP',
	block_schedules_write: 'Horarios de bloqueo por dispositivo',
	openvpn_admin: 'Usuarios del panel, 2FA admin, configuración crítica',
	backup_export: 'Descargar backup del panel',
	vpn_read: 'Ver usuarios y estado OpenVPN (sin crear/revocar)',
	vpn_write: 'Crear, revocar, expulsar usuarios VPN y descargar perfiles'
};

export function listPermissionsForRole(role: AuthRole | null | undefined): Permission[] {
	if (!role) return [];
	if (role === 'admin') {
		return Object.keys(PERMISSION_LABELS) as Permission[];
	}
	if (role === 'operator') return [...OPERATOR_PERMS];
	return [...AUDITOR_PERMS];
}

export function hasPermission(role: AuthRole | null | undefined, perm: Permission): boolean {
	if (!role) return false;
	return listPermissionsForRole(role).includes(perm);
}

/** Dashboard, DNS, auditoría, seguridad: admin, operador y auditor. */
export function hasStaffReadAccess(role: AuthRole | null | undefined): boolean {
	return role === 'admin' || role === 'operator' || role === 'auditor';
}
