<script lang="ts">
	import { onMount } from 'svelte';
	import './page.css';

	type VmHealth = {
		ok?: boolean;
		status?: number;
		latency_ms?: number;
		payload?: Record<string, unknown> | null;
		message?: string;
	};
	type Vm2Health = { ok?: boolean; service?: string; data_dir_writable?: boolean };

	let loading = $state(true);
	let vm2 = $state<Vm2Health | null>(null);
	let vm1 = $state<VmHealth | null>(null);
	let vm1Note = $state<string | null>(null);
	let pihole = $state<VmHealth | null>(null);
	let piholeNote = $state<string | null>(null);

	async function load() {
		loading = true;
		piholeNote = null;
		vm1Note = null;

		const [h2, h1, ph] = await Promise.all([
			fetch('/api/health', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/vpn/health', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/pihole/health', { headers: { 'cache-control': 'no-cache' } })
		]);

		vm2 = h2.ok ? ((await h2.json()) as Vm2Health) : { ok: false };

		if (h1.status === 401) {
			vm1 = null;
			vm1Note = 'Inicia sesión como administrador o auditor para comprobar la API OpenVPN (VM1).';
		} else {
			const j1 = await h1.json().catch(() => ({}));
			vm1 = j1 as VmHealth;
		}

		if (ph.status === 401) {
			pihole = null;
			piholeNote = 'Inicia sesión como administrador o auditor para comprobar Pi-hole.';
		} else {
			const jp = await ph.json().catch(() => ({}));
			pihole = jp as VmHealth;
		}

		loading = false;
	}

	onMount(load);
</script>

<main class="pageWrap pageWide page-status" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Estado del sistema</h1>
			<p class="panelHero__sub">Comprobación del panel (VM2), API OpenVPN (VM1) y Pi-hole.</p>
		</div>
		<div class="panelHero__actions">
			<button type="button" class="btn secondary btnAccent" onclick={load} disabled={loading}>
				{loading ? 'Comprobando…' : 'Recargar'}
			</button>
		</div>
	</header>

	{#if loading}
		<section class="panel panel--loading"><p class="muted">Cargando comprobaciones…</p></section>
	{:else}
		<section class="gridStatus">
			<div class="panel">
				<h2 class="panel__h2">Panel (VM2)</h2>
				<p class="pill {vm2?.ok ? 'ok' : 'bad'}">{vm2?.ok ? 'OK' : 'ERROR'}</p>
				<ul class="facts">
					<li><span class="k">Servicio</span> <span class="mono">{vm2?.service ?? '-'}</span></li>
					<li>
						<span class="k">Directorio datos escribible</span>
						<span>{vm2?.data_dir_writable ? 'sí' : 'no'}</span>
					</li>
				</ul>
			</div>

			<div class="panel">
				<h2 class="panel__h2">API OpenVPN (VM1)</h2>
				{#if vm1Note}
					<p class="muted">{vm1Note}</p>
				{:else}
					<p class="pill {vm1?.ok ? 'ok' : 'bad'}">{vm1?.ok ? 'OK' : 'ERROR'}</p>
					<ul class="facts">
						<li><span class="k">HTTP</span> <span class="mono">{vm1?.status ?? '-'}</span></li>
						<li><span class="k">Latencia</span> <span class="mono">{vm1?.latency_ms ?? '-'} ms</span></li>
						<li><span class="k">Versión</span> <span class="mono small">{String(vm1?.payload?.version ?? '-')}</span></li>
					</ul>
				{/if}
			</div>

			<div class="panel">
				<h2 class="panel__h2">Pi-hole</h2>
				{#if piholeNote}
					<p class="muted">{piholeNote}</p>
				{:else}
					<p class="pill {pihole?.ok ? 'ok' : 'bad'}">{pihole?.ok ? 'OK' : 'ERROR'}</p>
					<ul class="facts">
						<li><span class="k">HTTP</span> <span class="mono">{pihole?.status ?? '-'}</span></li>
						<li><span class="k">Latencia</span> <span class="mono">{pihole?.latency_ms ?? '-'} ms</span></li>
						<li><span class="k">Estado</span> <span class="mono small">{String(pihole?.payload?.status ?? '-')}</span></li>
					</ul>
				{/if}
			</div>
		</section>

		<section class="panel hints">
			<h2 class="panel__h2">Si algo falla</h2>
			<ul>
				<li>
					<strong>VM1:</strong> revisa <span class="mono">VPN_API_BASE_URL</span>, <span class="mono">VPN_API_KEY</span> y conectividad
					desde el contenedor del panel hasta la API.
				</li>
				<li>
					<strong>Pi-hole:</strong> <span class="mono">PIHOLE_BASE_URL</span>, token si aplica, y que la URL sea alcanzable desde VM2.
				</li>
				<li><strong>Datos locales:</strong> <span class="mono">AUDIT_DB_PATH</span> — el directorio debe ser escribible.</li>
				<li>Health Docker / balanceador: <span class="mono">GET /api/health</span></li>
			</ul>
		</section>
	{/if}
</main>
