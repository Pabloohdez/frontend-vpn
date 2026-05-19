<script lang="ts">
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import SessionExpiryBanner from '$lib/SessionExpiryBanner.svelte';
	import AuditorBanner from '$lib/AuditorBanner.svelte';
	import SectionNav from '$lib/SectionNav.svelte';
	import Toaster from '$lib/Toaster.svelte';
	import ShortcutsHelp from '$lib/ShortcutsHelp.svelte';
	import {
		getAppSection,
		openvpnLinks,
		piholeLinks
	} from '$lib/navigation';
	import '../app.css';

	let { children } = $props();

	const section = $derived(getAppSection(page.url.pathname));
	const showAppNav = $derived(section !== 'hub');

	const sectionLinks = $derived(
		section === 'openvpn' ? openvpnLinks : section === 'pihole' ? piholeLinks : []
	);
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
	<link
		href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<a href="#contenido-principal" class="skip-link">Saltar al contenido principal</a>

<SessionExpiryBanner />
<AuditorBanner />

{#if showAppNav}
	<SectionNav links={sectionLinks} />
{/if}

<div class:shellPage={showAppNav}>
	{@render children()}
</div>

<Toaster />
<ShortcutsHelp />
