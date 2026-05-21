<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import LoginForm from '$lib/LoginForm.svelte';
	import './page.css';

	let next = $state<string>('/');

	onMount(() => {
		const url = new URL(window.location.href);
		next = url.searchParams.get('next') || '/';
	});

	async function onLoginSuccess() {
		await goto(next);
		window.location.reload();
	}
</script>

<main class="pageWrap pageWide page-login" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<a class="settingsBack" href="/">← Inicio</a>
			<h1 class="panelHero__title">Iniciar sesión</h1>
			<p class="panelHero__sub">Acceso al panel (Pi-hole, seguridad y OpenVPN).</p>
		</div>
	</header>

	<section class="panel loginPanel">
		<LoginForm onSuccess={onLoginSuccess} />
	</section>
</main>
