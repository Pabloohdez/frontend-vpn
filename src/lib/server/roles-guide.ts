import { PERMISSION_LABELS, type Permission } from '$lib/server/permissions';
import type { AuthRole } from '$lib/server/permissions';

const ROLE_DESC: Record<AuthRole, string> = {
	admin: 'Responsable IT: control total del panel, usuarios VPN, backup y 2FA.',
	operator:
		'Soporte o aulas: Pi-hole, bloqueos programados y consulta de clientes VPN; no crea ni revoca certificados.',
	auditor: 'Solo lectura: dashboard, DNS, auditoría y seguridad; sin cambios en listas ni bloqueos.'
};

const ROLE_PERMS: Record<AuthRole, Permission[]> = {
	admin: Object.keys(PERMISSION_LABELS) as Permission[],
	operator: [
		'read',
		'pihole_write',
		'internet_block_write',
		'block_schedules_write',
		'vpn_read'
	],
	auditor: ['read', 'vpn_read']
};

/** Markdown para memoria / tutor (generado desde la matriz del código). */
export function buildRolesGuideMarkdown(): string {
	const lines: string[] = [
		'# Guía de roles — Panel VPN',
		'',
		'Documento generado desde `src/lib/server/permissions.ts`.',
		'',
		'## Resumen por rol',
		''
	];
	for (const role of ['admin', 'operator', 'auditor'] as AuthRole[]) {
		lines.push(`### ${role}`, '', ROLE_DESC[role], '', '| Permiso | Descripción |', '|---------|-------------|');
		for (const p of ROLE_PERMS[role]) {
			lines.push(`| \`${p}\` | ${PERMISSION_LABELS[p]} |`);
		}
		lines.push('');
	}
	lines.push(
		'## Políticas por usuario VPN (CN)',
		'',
		'- **Categorías DNS** y **horarios de bloqueo de internet** pueden aplicarse por IP o por CN OpenVPN.',
		'- El panel resuelve el CN a IPs usando el histórico `vpn-ipcn-history.json` (actualizado al consultar estado VPN).',
		'',
		'## Más información',
		'',
		'- Checklist de seguridad: `docs/SECURITY.md`',
		'- HTTPS en producción: `docs/HTTPS.md`',
		''
	);
	return lines.join('\n');
}
