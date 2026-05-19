<script lang="ts">
	import { onMount } from 'svelte';
	import './hub.css';

	type Health = { ok: boolean; status: number; latency_ms: number; payload: { status?: string } | null };
	let health = $state<Health | null>(null);
	let loading = $state(true);

	async function refreshHealth() {
		loading = health === null;
		const res = await fetch('/api/pihole/health', { headers: { 'cache-control': 'no-cache' } });
		health = res.ok
			? await res.json()
			: { ok: false, status: res.status, latency_ms: -1, payload: null };
		loading = false;
	}

	onMount(refreshHealth);

	const modules = [
		{ href: '/dns', label: 'DNS', hint: 'Consultas, filtros y correlación con clientes' },
		{ href: '/pihole/listas', label: 'Listas', hint: 'Permitir, bloquear y gestionar dominios' },
		{ href: '/pihole/bloqueos', label: 'Dispositivos', hint: 'Red completa: ver equipos y cortar internet (DNS)' },
		{ href: '/seguridad', label: 'Seguridad', hint: 'Insights, patrones y auditoría DNS' }
	] as const;
</script>

<main class="pageWrap pageWide page-pihole-hub" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Pi-hole</h1>
			<p class="panelHero__sub">DNS, listas y panel de seguridad.</p>
		</div>
		<div class="panelHero__actions">
			<button type="button" class="btn secondary btnAccent" onclick={refreshHealth} disabled={loading}>
				{loading ? 'Cargando…' : 'Refrescar'}
			</button>
		</div>
	</header>

	<section class="panel hubHealth">
		<h2 class="panel__h2">Estado</h2>
		<div class="hubHealth__grid">
			<div class="pill {health?.ok ? 'ok' : 'bad'}">
				<span class="k">Health</span>
				<span class="v">{health?.ok ? 'OK' : health === null ? '…' : 'ERROR'}</span>
			</div>
			<div class="pill">
				<span class="k">HTTP</span>
				<span class="v">{health ? health.status : '-'}</span>
			</div>
			<div class="pill">
				<span class="k">Latencia</span>
				<span class="v">{health ? `${health.latency_ms} ms` : '-'}</span>
			</div>
			<div class="pill">
				<span class="k">Status</span>
				<span class="v">{health?.payload?.status ?? '-'}</span>
			</div>
		</div>
	</section>

	<nav class="hubModules" aria-label="Módulos Pi-hole">
		{#each modules as m (m.href)}
			<a href={m.href} class="hubModuleCard">
				<span class="hubModuleCard__label">{m.label}</span>
				<span class="hubModuleCard__hint muted">{m.hint}</span>
			</a>
		{/each}
	</nav>
</main>
