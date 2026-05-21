import { describe, expect, it } from 'vitest';
import { hasPermission, hasStaffReadAccess, listPermissionsForRole } from '$lib/server/permissions';

describe('permissions', () => {
	it('admin tiene todos los permisos', () => {
		expect(hasPermission('admin', 'vpn_write')).toBe(true);
		expect(hasPermission('admin', 'backup_export')).toBe(true);
	});

	it('operador puede Pi-hole y leer VPN pero no escribir', () => {
		expect(hasPermission('operator', 'pihole_write')).toBe(true);
		expect(hasPermission('operator', 'vpn_read')).toBe(true);
		expect(hasPermission('operator', 'vpn_write')).toBe(false);
		expect(hasPermission('operator', 'backup_export')).toBe(false);
		expect(hasPermission('operator', 'openvpn_admin')).toBe(false);
	});

	it('auditor solo lectura', () => {
		expect(hasPermission('auditor', 'read')).toBe(true);
		expect(hasPermission('auditor', 'vpn_read')).toBe(true);
		expect(hasPermission('auditor', 'pihole_write')).toBe(false);
		expect(hasPermission('auditor', 'vpn_write')).toBe(false);
	});

	it('staff read incluye operador', () => {
		expect(hasStaffReadAccess('operator')).toBe(true);
		expect(hasStaffReadAccess('auditor')).toBe(true);
		expect(hasStaffReadAccess(null)).toBe(false);
	});

	it('listPermissionsForRole no está vacío para roles válidos', () => {
		expect(listPermissionsForRole('admin').length).toBeGreaterThan(5);
		expect(listPermissionsForRole('operator')).toContain('vpn_read');
	});
});
