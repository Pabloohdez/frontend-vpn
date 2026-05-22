<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import Skeleton from '$lib/Skeleton.svelte';
	import { readRefreshMs, refreshLabel, refreshPresets, writeRefreshMs } from '$lib/refresh-prefs';
	import './hub.css';

	type Health = {
		ok: boolean;
		status: number;
		latency_ms: number;
		payload: { status?: string } | null;
		stale?: boolean;
		last_known?: { at: string };
	};
	let health = $state<Health | null>(null);
	let loading = $state(true);
	let refreshMs = $state(readRefreshMs(10000));
	let interval: ReturnType<typeof setInterval> | null = null;

	async function refreshHealth() {
		loading = health === null;
		const res = await fetch('/api/pihole/health', { headers: { 'cache-control': 'no-cache' } });
		health = res.ok
			? await res.json()
			: { ok: false, status: res.status, latency_ms: -1, payload: null };
		loading = false;
	}

	function restartAutoRefresh() {
		if (interval) clearInterval(interval);
		interval = null;
		if (refreshMs > 0) interval = setInterval(refreshHealth, refreshMs);
	}

	onMount(() => {
		refreshMs = readRefreshMs(10000);
		refreshHealth().then(() => restartAutoRefresh());
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});

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
			<label class="refreshSelect muted">
				<span class="visually-hidden">Auto-refresco</span>
				<select
					class="inp inp--compact"
					value={String(refreshMs)}
					onchange={(e) => {
						refreshMs = Number((e.currentTarget as HTMLSelectElement).value);
						writeRefreshMs(refreshMs);
						restartAutoRefresh();
					}}
				>
					{#each refreshPresets() as ms (ms)}
						<option value={String(ms)}>{refreshLabel(ms)}</option>
					{/each}
				</select>
			</label>
			<button type="button" class="btn secondary btnAccent" onclick={refreshHealth} disabled={loading}>
				{loading ? 'Cargando…' : 'Refrescar'}
			</button>
		</div>
	</header>

	{#if health?.stale}
		<section class="panel panel--warn staleBanner" role="status">
			<strong>Pi-hole — último estado conocido</strong>
			<p class="muted">
				No responde ahora. Última lectura: {health.last_known?.at ?? '—'}
			</p>
		</section>
	{/if}

	<section class="panel hubHealth">
		<h2 class="panel__h2">Estado</h2>
		{#if loading && !health}
			<div class="hubHealth__grid">
				{#each [1, 2, 3, 4] as _}
					<Skeleton height="56px" />
				{/each}
			</div>
		{:else}
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
		{/if}
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
