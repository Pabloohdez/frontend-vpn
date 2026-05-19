<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import ModuleSwitcher from '$lib/ModuleSwitcher.svelte';
	import { globalNavLinks, isActivePath } from '$lib/navigation';

	type NavLink = { href: string; label: string };

	let {
		links = [],
		globalLinks = globalNavLinks
	}: { links?: readonly NavLink[]; globalLinks?: readonly NavLink[] } = $props();

	const pathname = $derived(page.url.pathname);
</script>

<nav class="nav sectionNav" aria-label="Navegación del panel">
	<a class="brand" href="/" title="Volver al inicio">Panel VPN</a>
	<ModuleSwitcher />
	<div class="links">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class:active={isActivePath(pathname, link.href)}
				aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
			>
				{link.label}
			</a>
		{/each}
		{#if links.length > 0 && globalLinks.length > 0}
			<span class="navDivider" aria-hidden="true"></span>
		{/if}
		{#each globalLinks as link (link.href)}
			<a
				href={link.href}
				class="navGlobal"
				class:active={isActivePath(pathname, link.href)}
				aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
			>
				{link.label}
			</a>
		{/each}
		<a
			href="/ajustes"
			class="navIconBtn"
			class:active={pathname === '/ajustes'}
			title="Ajustes"
			aria-label="Ajustes"
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<circle cx="12" cy="12" r="3" />
				<path
					d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
				/>
			</svg>
		</a>
		<ThemeToggle />
	</div>
</nav>
