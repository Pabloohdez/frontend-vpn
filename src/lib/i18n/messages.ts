export type Locale = 'es' | 'en';

export type MessageKey =
	| 'nav.brand'
	| 'nav.audit'
	| 'nav.settings'
	| 'nav.skip'
	| 'nav.pihole.summary'
	| 'nav.pihole.dashboard'
	| 'nav.pihole.dns'
	| 'nav.pihole.lists'
	| 'nav.pihole.devices'
	| 'nav.pihole.security'
	| 'nav.openvpn.dashboard'
	| 'nav.openvpn.status'
	| 'nav.openvpn.users'
	| 'lang.label'
	| 'lang.es'
	| 'lang.en'
	| 'common.loading'
	| 'common.refresh'
	| 'common.error'
	| 'dashboard.title'
	| 'dashboard.sub'
	| 'dashboard.range24h'
	| 'dashboard.range7d'
	| 'dashboard.range30d'
	| 'security.title'
	| 'security.sub'
	| 'schedules.title'
	| 'schedules.add'
	| 'schedules.empty'
	| 'schedules.enabled'
	| 'schedules.days'
	| 'schedules.from'
	| 'schedules.to'
	| 'schedules.save'
	| 'schedules.delete';

const es: Record<MessageKey, string> = {
	'nav.brand': 'Panel VPN',
	'nav.audit': 'Auditoría',
	'nav.settings': 'Ajustes',
	'nav.skip': 'Saltar al contenido principal',
	'nav.pihole.summary': 'Resumen',
	'nav.pihole.dashboard': 'Dashboard',
	'nav.pihole.dns': 'DNS',
	'nav.pihole.lists': 'Listas',
	'nav.pihole.devices': 'Dispositivos',
	'nav.pihole.security': 'Seguridad',
	'nav.openvpn.dashboard': 'Dashboard',
	'nav.openvpn.status': 'Estado',
	'nav.openvpn.users': 'Usuarios',
	'lang.label': 'Idioma',
	'lang.es': 'Español',
	'lang.en': 'English',
	'common.loading': 'Cargando…',
	'common.refresh': 'Actualizar',
	'common.error': 'Error',
	'dashboard.title': 'Dashboard',
	'dashboard.sub': 'Visión general de tráfico DNS, bloqueos y dispositivos más activos.',
	'dashboard.range24h': '24 h',
	'dashboard.range7d': '7 días',
	'dashboard.range30d': '30 días',
	'security.title': 'Seguridad',
	'security.sub': 'Resumen DNS, clientes y eventos de auditoría en una ventana de tiempo.',
	'schedules.title': 'Horarios de bloqueo',
	'schedules.add': 'Programar bloqueo',
	'schedules.empty': 'Sin horarios configurados.',
	'schedules.enabled': 'Activo',
	'schedules.days': 'Días',
	'schedules.from': 'Desde',
	'schedules.to': 'Hasta',
	'schedules.save': 'Guardar',
	'schedules.delete': 'Eliminar'
};

const en: Record<MessageKey, string> = {
	'nav.brand': 'VPN Panel',
	'nav.audit': 'Audit',
	'nav.settings': 'Settings',
	'nav.skip': 'Skip to main content',
	'nav.pihole.summary': 'Overview',
	'nav.pihole.dashboard': 'Dashboard',
	'nav.pihole.dns': 'DNS',
	'nav.pihole.lists': 'Lists',
	'nav.pihole.devices': 'Devices',
	'nav.pihole.security': 'Security',
	'nav.openvpn.dashboard': 'Dashboard',
	'nav.openvpn.status': 'Status',
	'nav.openvpn.users': 'Users',
	'lang.label': 'Language',
	'lang.es': 'Español',
	'lang.en': 'English',
	'common.loading': 'Loading…',
	'common.refresh': 'Refresh',
	'common.error': 'Error',
	'dashboard.title': 'Dashboard',
	'dashboard.sub': 'Overview of DNS traffic, blocks, and most active devices.',
	'dashboard.range24h': '24 h',
	'dashboard.range7d': '7 days',
	'dashboard.range30d': '30 days',
	'security.title': 'Security',
	'security.sub': 'DNS summary, clients, and audit events in a time window.',
	'schedules.title': 'Block schedules',
	'schedules.add': 'Schedule block',
	'schedules.empty': 'No schedules configured.',
	'schedules.enabled': 'Enabled',
	'schedules.days': 'Days',
	'schedules.from': 'From',
	'schedules.to': 'To',
	'schedules.save': 'Save',
	'schedules.delete': 'Delete'
};

export const messages: Record<Locale, Record<MessageKey, string>> = { es, en };
