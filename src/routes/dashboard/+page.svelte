<script lang="ts">
	import { onMount } from 'svelte';
	import BarSeries from '$lib/charts/BarSeries.svelte';
	import Donut from '$lib/charts/Donut.svelte';
	import HBarList from '$lib/charts/HBarList.svelte';
	import Skeleton from '$lib/Skeleton.svelte';
	import EmptyState from '$lib/EmptyState.svelte';
	import AuthGate from '$lib/AuthGate.svelte';
	import { describeFetchResponse } from '$lib/api-errors';
	import { t } from '$lib/i18n/locale.svelte';
	import './page.css';

	type Range = '24h' | '7d' | '30d';

	type SeriesPoint = { t: number; label: string; total: number; allowed: number; blocked: number };
	type Summary = {
		total: number;
		blocked: number;
		blocked_ratio: number | null;
		block_estimate: 'ok' | 'unknown';
	};
	type Domain = { domain: string; count: number };
	type Client = {
		client: string;
		count: number;
		resolved_ip: string | null;
		lan_ip: string | null;
		device_label: string | null;
		device_type: string | null;
		sede_name: string | null;
	};
	type Payload = {
		range: Range;
		window_hours: number;
		granularity: 'hour' | 'day';
		pi_hole_reachable: boolean;
		summary: Summary;
		top_domains: Domain[];
		top_clients: Client[];
		series: SeriesPoint[];
	};

	let range = $state<Range>('24h');
	let data = $state<Payload | null>(null);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let needsAuth = $state(false);

	async function load() {
		loading = data === null;
		error = null;
		needsAuth = false;
		try {
			const res = await fetch(`/api/admin/dashboard?range=${range}`, {
				headers: { 'cache-control': 'no-cache' }
			});
			if (!res.ok) {
				const fail = await describeFetchResponse(res, 'No se pudo cargar el dashboard.');
				needsAuth = fail.needsAuth;
				error = fail.message;
				data = null;
			} else {
				data = (await res.json()) as Payload;
			}
		} catch (e) {
			error = e instanceof Error ? e.message : 'No se pudo cargar el dashboard';
			data = null;
		} finally {
			loading = false;
		}
	}

	function setRange(r: Range) {
		range = r;
		load();
	}

	onMount(load);
</script>

<svelte:head>
	<title>Dashboard · Panel VPN</title>
</svelte:head>

<main class="pageWrap pageWide page-dashboard" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">{t('dashboard.title')}</h1>
			<p class="panelHero__sub">{t('dashboard.sub')}</p>
		</div>
		<div class="panelHero__actions dashRanges" role="group" aria-label="Ventana temporal">
			<button
				type="button"
				class="btn ghost dashRange"
				class:dashRange--active={range === '24h'}
				onclick={() => setRange('24h')}
				aria-pressed={range === '24h'}
			>
				{t('dashboard.range24h')}
			</button>
			<button
				type="button"
				class="btn ghost dashRange"
				class:dashRange--active={range === '7d'}
				onclick={() => setRange('7d')}
				aria-pressed={range === '7d'}
			>
				{t('dashboard.range7d')}
			</button>
			<button
				type="button"
				class="btn ghost dashRange"
				class:dashRange--active={range === '30d'}
				onclick={() => setRange('30d')}
				aria-pressed={range === '30d'}
			>
				{t('dashboard.range30d')}
			</button>
			<button type="button" class="btn secondary btnAccent" onclick={load} disabled={loading}>
				{loading ? t('common.loading') : t('common.refresh')}
			</button>
		</div>
	</header>

	{#if needsAuth}
		<AuthGate message={error ?? undefined} nextPath="/dashboard" />
	{:else if error}
		<section class="panel cardError">{error}</section>
	{:else if loading && !data}
		<section class="dashGrid">
			<div class="panel">
				<Skeleton height="22px" width="120px" />
				<div style="margin-top:14px"><Skeleton height="220px" /></div>
			</div>
			<div class="panel"><Skeleton height="220px" /></div>
		</section>
	{:else if data}
		{#if !data.pi_hole_reachable}
			<section class="panel cardError">
				Pi-hole no respondió: comprueba <code>PIHOLE_BASE_URL</code> y credenciales.
			</section>
		{:else if data.summary.total === 0}
			<section class="panel">
				<EmptyState
					title="Sin consultas en esta ventana"
					description="Cambia el rango temporal o comprueba que el tráfico atraviesa Pi-hole."
				/>
			</section>
		{:else}
			<section class="dashKpis">
				<div class="panel dashKpi">
					<span class="dashKpi__k">Consultas</span>
					<span class="dashKpi__v mono">{data.summary.total.toLocaleString('es-ES')}</span>
					<span class="dashKpi__sub muted">
						{data.window_hours >= 24
							? `${Math.round(data.window_hours / 24)} días`
							: `${data.window_hours} horas`}
					</span>
				</div>
				<div class="panel dashKpi">
					<span class="dashKpi__k">Bloqueadas</span>
					<span class="dashKpi__v mono">{data.summary.blocked.toLocaleString('es-ES')}</span>
					<span class="dashKpi__sub muted">
						{data.summary.blocked_ratio !== null
							? `${(data.summary.blocked_ratio * 100).toFixed(1)} %`
							: '—'}
					</span>
				</div>
				<div class="panel dashKpi">
					<span class="dashKpi__k">Dominios únicos</span>
					<span class="dashKpi__v mono">{data.top_domains.length.toLocaleString('es-ES')}+</span>
					<span class="dashKpi__sub muted">top mostrados</span>
				</div>
				<div class="panel dashKpi">
					<span class="dashKpi__k">Dispositivos activos</span>
					<span class="dashKpi__v mono">{data.top_clients.length.toLocaleString('es-ES')}+</span>
					<span class="dashKpi__sub muted">en esta ventana</span>
				</div>
			</section>

			<section class="dashGrid">
				<div class="panel dashChart">
					<h2 class="panel__h2">Tráfico DNS por {data.granularity === 'hour' ? 'hora' : 'día'}</h2>
					<BarSeries
						points={data.series.map((p) => ({
							label: p.label,
							allowed: p.allowed,
							blocked: p.blocked
						}))}
						ariaLabel="Consultas permitidas y bloqueadas a lo largo del tiempo"
					/>
					<div class="dashLegend">
						<span class="dashLegend__item"><i class="dashSwatch dashSwatch--ok"></i> Permitidas</span>
						<span class="dashLegend__item"><i class="dashSwatch dashSwatch--block"></i> Bloqueadas</span>
					</div>
				</div>
				<div class="panel dashDonutCard">
					<h2 class="panel__h2">Ratio de bloqueo</h2>
					<div class="dashDonut">
						<Donut allowed={data.summary.total - data.summary.blocked} blocked={data.summary.blocked} />
					</div>
					{#if data.summary.block_estimate === 'unknown'}
						<p class="panelHint">
							Pi-hole no devolvió estados FTL en esta ventana; el ratio puede estar infravalorado.
						</p>
					{/if}
				</div>
			</section>

			<section class="dashGrid">
				<div class="panel">
					<h2 class="panel__h2">Top 10 dominios consultados</h2>
					<HBarList
						rows={data.top_domains.map((d) => ({ label: d.domain, count: d.count }))}
						emptyText="Sin dominios."
					/>
				</div>
				<div class="panel">
					<h2 class="panel__h2">Top 10 dispositivos</h2>
					<HBarList
						rows={data.top_clients.map((c) => ({
							label: c.device_label ?? c.client,
							sublabel: c.lan_ip ?? c.resolved_ip ?? c.client,
							count: c.count
						}))}
						emptyText="Sin dispositivos."
					/>
				</div>
			</section>
		{/if}
	{/if}
</main>
