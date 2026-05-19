<script lang="ts">
	import { page } from '$app/state';
	import { getAppSection, type AppSection } from '$lib/navigation';

	const modules = [
		{ id: 'openvpn' as const, href: '/openvpn', label: 'OpenVPN' },
		{ id: 'pihole' as const, href: '/pihole', label: 'Pi-hole' }
	];

	const section = $derived(getAppSection(page.url.pathname));

	function isModuleActive(id: 'openvpn' | 'pihole', current: AppSection): boolean {
		if (id === 'openvpn') return current === 'openvpn';
		if (id === 'pihole') return current === 'pihole';
		return false;
	}
</script>

<div class="moduleSwitcher" role="navigation" aria-label="Cambiar entre OpenVPN y Pi-hole">
	{#each modules as m (m.id)}
		<a
			href={m.href}
			class="moduleSwitcher__btn"
			class:moduleSwitcher__btn--active={isModuleActive(m.id, section)}
			aria-current={isModuleActive(m.id, section) ? 'page' : undefined}
		>
			{m.label}
		</a>
	{/each}
</div>
