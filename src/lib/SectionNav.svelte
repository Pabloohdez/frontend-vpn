<script lang="ts">
	import { page } from '$app/state';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import ModuleSwitcher from '$lib/ModuleSwitcher.svelte';
	import { globalNavLinks, isActivePath, type NavLinkDef } from '$lib/navigation';
	import { t } from '$lib/i18n/locale.svelte';
	import LanguageToggle from '$lib/LanguageToggle.svelte';

	let {
		links = [],
		globalLinks = globalNavLinks
	}: { links?: readonly NavLinkDef[]; globalLinks?: readonly NavLinkDef[] } = $props();

	const pathname = $derived(page.url.pathname);
</script>

<nav class="nav sectionNav" aria-label="Navegación del panel">
	<a class="brand" href="/" title={t('nav.brand')}>{t('nav.brand')}</a>
	<ModuleSwitcher />
	<div class="links">
		{#each links as link (link.href)}
			<a
				href={link.href}
				class:active={isActivePath(pathname, link.href)}
				aria-current={isActivePath(pathname, link.href) ? 'page' : undefined}
			>
				{t(link.labelKey)}
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
				{t(link.labelKey)}
			</a>
		{/each}
		<a
			href="/ajustes"
			class="navIconBtn"
			class:active={pathname === '/ajustes'}
			title={t('nav.settings')}
			aria-label={t('nav.settings')}
		>
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
				<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
				<path
					d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.2-2-3.4-2.3.5a8 8 0 0 0-.8-.7L16 6h-4l-.4 2.2a8 8 0 0 0-.9.5l-2.3-.5-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.5c.3.3.6.6.9.8L12 22h4l.4-2.2c.3-.2.6-.4.9-.6l2.3.5 2-3.4-2-1.2Z"
				/>
			</svg>
		</a>
		<LanguageToggle />
		<ThemeToggle />
	</div>
</nav>
