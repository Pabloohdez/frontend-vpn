<script lang="ts">
	import { onMount } from 'svelte';
	import AuthGate from '$lib/AuthGate.svelte';
	import { describeFetchResponse } from '$lib/api-errors';
	import './page.css';

	type DnsInsights = {
		total: number;
		blocked: number;
		blocked_ratio: number | null;
		block_estimate: string;
		top_domains: { domain: string; count: number }[];
		top_clients: {
			client: string;
			count: number;
			resolved_ip: string | null;
			lan_ip: string | null;
			device_label: string | null;
			device_type: string | null;
			sede_name: string | null;
		}[];
	};

	type AuditInsights = {
		total_events: number;
		by_action: Record<string, number>;
		failed_logins: number;
	};

	type SecurityAlert = {
		id: string;
		severity: 'warn' | 'critical';
		title: string;
		detail: string;
	};

	type DnsAnomaly = {
		client: string;
		label: string | null;
		current: number;
		baseline_avg: number;
		multiplier: number;
		severity: 'warn' | 'critical';
	};

	type Payload = {
		window_hours: number;
		audit_days: number;
		pi_hole_reachable: boolean;
		netmonitor_configured?: boolean;
		netmonitor_reachable?: boolean;
		dns: DnsInsights | null;
		audit: AuditInsights;
		anomalies?: DnsAnomaly[];
		threats?: {
			kind: 'tunneling_suspect' | 'txt_suspect';
			client: string;
			label: string | null;
			domain: string;
			score: number;
			detail: string;
		}[];
		alerts?: SecurityAlert[];
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let needsAuth = $state(false);
	let data = $state<Payload | null>(null);
	let windowHours = $state(24);
	let onlyCritical = $state(false);
	let showAllAnoms = $state(false);
	const ANOM_PREVIEW = 8;

	const visibleAlerts = $derived(
		(data?.alerts ?? []).filter((a) => !onlyCritical || a.severity === 'critical')
	);
	const visibleAnomalies = $derived(
		(data?.anomalies ?? []).filter((a) => !onlyCritical || a.severity === 'critical')
	);
	const visibleThreats = $derived(
		(data?.threats ?? []).filter((t) => !onlyCritical || t.score >= 80)
	);

	const sortedAnomalies = $derived(
		[...visibleAnomalies].sort((a, b) => b.current - a.current)
	);
	const shownAnomalies = $derived(
		showAllAnoms ? sortedAnomalies : sortedAnomalies.slice(0, ANOM_PREVIEW)
	);
	const hiddenAnomCount = $derived(Math.max(0, sortedAnomalies.length - ANOM_PREVIEW));

	function alertDetailParts(detail: string): string[] {
		const chunks = detail.split(/\s*·\s*|\n+/).map((s) => s.trim()).filter(Boolean);
		return chunks.length > 1 ? chunks : [detail];
	}

	function anomalyBadge(a: DnsAnomaly): string {
		if (Number.isFinite(a.multiplier) && a.multiplier > 0) return `×${a.multiplier}`;
		return 'Sin histórico';
	}

	const criticalCount = $derived.by(() => {
		if (!data) return 0;
		const alerts = (data.alerts ?? []).filter((a) => a.severity === 'critical').length;
		const anoms = (data.anomalies ?? []).filter((a) => a.severity === 'critical').length;
		const threats = (data.threats ?? []).filter((t) => t.score >= 80).length;
		return alerts + anoms + threats;
	});

	function barPct(count: number, max: number) {
		if (!max) return 0;
		return Math.round((100 * count) / max);
	}

	async function load() {
		loading = data === null;
		error = null;
		needsAuth = false;
		const res = await fetch(`/api/admin/security-insights?window_hours=${windowHours}`, {
			headers: { 'cache-control': 'no-cache' }
		});
		if (!res.ok) {
			const fail = await describeFetchResponse(res, 'No se pudieron cargar las métricas de seguridad.');
			needsAuth = fail.needsAuth;
			error = fail.message;
			data = null;
			loading = false;
			return;
		}
		data = (await res.json()) as Payload;
		loading = false;
	}

	onMount(() => {
		load();
	});
</script>

<main class="pageWrap pageWide page-seguridad" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Seguridad</h1>
			<p class="panelHero__sub">Resumen DNS, clientes y eventos de auditoría en una ventana de tiempo.</p>
		</div>
		<div class="panelHero__actions tools">
			<label class="panelFilterLab" for="sec-window">Ventana (h)</label>
			<input
				id="sec-window"
				class="input winInp"
				type="number"
				min="1"
				max="168"
				bind:value={windowHours}
			/>
			<label class="secFilterCrit">
				<input type="checkbox" bind:checked={onlyCritical} />
				Solo críticos
			</label>
			<button type="button" class="btn secondary btnAccent" disabled={loading} onclick={load}>
				{loading ? 'Cargando…' : 'Actualizar'}
			</button>
		</div>
	</header>

	{#if needsAuth}
		<AuthGate message={error ?? undefined} nextPath="/seguridad" />
	{:else if error}
		<section class="panel cardError">{error}</section>
	{:else if loading && !data}
		<section class="panel panel--loading"><p class="muted">Cargando métricas…</p></section>
	{:else if data}
		{#if criticalCount > 0 && !onlyCritical}
			<p class="secCritBanner muted">
				{criticalCount} elemento(s) crítico(s). Activa «Solo críticos» para centrarte en lo urgente.
			</p>
		{/if}

		{#if visibleAlerts.length > 0}
			<section class="panel secAlerts" aria-label="Alertas de seguridad">
				<h2 class="panel__h2">Alertas ({visibleAlerts.length})</h2>
				<ul class="secAlerts__list">
					{#each visibleAlerts as alert (alert.id)}
						<li class="secAlert secAlert--{alert.severity}">
							<div class="secAlert__head">
								<strong class="secAlert__title">{alert.title}</strong>
								<span class="secBadge secBadge--{alert.severity}">
									{alert.severity === 'critical' ? 'Crítico' : 'Aviso'}
								</span>
							</div>
							{@const parts = alertDetailParts(alert.detail)}
							{#if parts.length > 1 || alert.detail.length > 140}
								<details class="secAlertExpand">
									<summary class="secAlertExpand__sum">
										Ver detalle ({parts.length > 1 ? `${parts.length} entradas` : 'texto largo'})
									</summary>
									{#if parts.length > 1}
										<ul class="secAlert__items">
											{#each parts as line, i (i)}
												<li class="secAlert__item mono">{line}</li>
											{/each}
										</ul>
									{:else}
										<p class="secAlert__detail">{alert.detail}</p>
									{/if}
								</details>
							{:else}
								<p class="secAlert__detail">{alert.detail}</p>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if visibleAnomalies.length > 0}
			<section class="panel secAnoms" aria-label="Anomalías de actividad DNS">
				<h2 class="panel__h2">Anomalías DNS ({visibleAnomalies.length})</h2>
				<p class="muted secAnoms__hint">
					Dispositivos con actividad muy superior a su media de los últimos 7 días.
				</p>
				<ul class="secAnoms__list">
					{#each shownAnomalies as a (a.client)}
						<li class="secAnom secAnom--{a.severity}">
							<div class="secAnom__top">
								<div class="secAnom__identity">
									<strong class="secAnom__name">{a.label ?? a.client}</strong>
									<span class="secAnom__client mono">{a.client}</span>
								</div>
								<span class="secBadge secBadge--{a.severity}">{anomalyBadge(a)}</span>
							</div>
							<div class="secAnom__stats">
								<div class="secAnom__stat">
									<span class="secAnom__statN">{a.current.toLocaleString('es-ES')}</span>
									<span class="secAnom__statL">consultas</span>
								</div>
								{#if a.baseline_avg > 0}
									<div class="secAnom__stat secAnom__stat--muted">
										<span class="secAnom__statN">≈ {a.baseline_avg.toLocaleString('es-ES')}</span>
										<span class="secAnom__statL">habituales</span>
									</div>
								{/if}
							</div>
							<a class="secAnom__link" href={`/dns?device_ip=${encodeURIComponent(a.client)}`}>
								Ver consultas →
							</a>
						</li>
					{/each}
				</ul>
				{#if hiddenAnomCount > 0 && !showAllAnoms}
					<button type="button" class="btn btnSecondary secAnoms__more" onclick={() => (showAllAnoms = true)}>
						Mostrar {hiddenAnomCount} más
					</button>
				{:else if showAllAnoms && sortedAnomalies.length > ANOM_PREVIEW}
					<button type="button" class="btn btnSecondary secAnoms__more" onclick={() => (showAllAnoms = false)}>
						Mostrar menos
					</button>
				{/if}
			</section>
		{/if}

		{#if visibleThreats.length > 0}
			<section class="panel secThreats" aria-label="Sospechas de DNS tunneling">
				<h2 class="panel__h2">Sospechas DNS ({visibleThreats.length})</h2>
				<p class="muted secAnoms__hint">
					Heurísticas: subdominios largos/alta entropía y consultas TXT inusuales. Revisa antes de actuar.
				</p>
				<ul class="secAnoms__list">
					{#each visibleThreats as t (`${t.kind}-${t.client}-${t.domain}`)}
						<li class="secAnom secAnom--{t.score >= 80 ? 'critical' : 'warn'}">
							<div class="secAnom__top">
								<div class="secAnom__identity">
									<strong class="secAnom__name">{t.label ?? t.client}</strong>
									<span class="secAnom__client mono">{t.client}</span>
								</div>
								<span class="secBadge secBadge--{t.score >= 80 ? 'critical' : 'warn'}">
									{t.kind === 'txt_suspect' ? 'TXT' : `Score ${t.score}`}
								</span>
							</div>
							<div class="secThreat__domain mono" title={t.domain}>{t.domain}</div>
							<p class="secAnom__meta">{t.detail}</p>
							<a class="secAnom__link" href={`/dns?device_ip=${encodeURIComponent(t.client)}`}>
								Ver consultas →
							</a>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
		<section class="panelGrid2">
			<div class="panel">
				<h2 class="panel__h2">DNS (últimas {data.window_hours} h)</h2>
				{#if !data.pi_hole_reachable || !data.dns}
					<p class="muted">Pi-hole no respondió con datos en este intervalo.</p>
				{:else}
					{@const d = data.dns}
					{@const maxD = d.top_domains[0]?.count ?? 1}
					{@const maxC = d.top_clients[0]?.count ?? 1}
					<div class="panelStats">
						<div class="panelStat">
							<span class="panelStat__k">Consultas</span>
							<span class="panelStat__v mono">{d.total.toLocaleString()}</span>
						</div>
						<div class="panelStat">
							<span class="panelStat__k">Bloqueos (estim.)</span>
							<span class="panelStat__v mono">{d.blocked.toLocaleString()}</span>
						</div>
						<div class="panelStat">
							<span class="panelStat__k">Ratio bloqueo</span>
							<span class="panelStat__v mono">
								{d.block_estimate === 'unknown' ? '— (sin estado FTL)' : d.blocked_ratio != null ? `${(d.blocked_ratio * 100).toFixed(1)} %` : '—'}
							</span>
						</div>
					</div>
					{#if d.block_estimate === 'unknown'}
						<p class="panelHint">
							Todas las filas tienen estado 0: la API puede no exponer el código FTL (p. ej. algunas respuestas
							v6). El resto del panel sigue siendo útil.
						</p>
					{/if}
					{#if data.netmonitor_configured && !data.netmonitor_reachable}
						<p class="panelHint">netmonitor configurado pero no alcanzable; los clientes no muestran dispositivo.</p>
					{/if}
					<div class="split">
						<div>
							<h3 class="h3">Top dominios</h3>
							<ul class="panelBarList">
								{#each d.top_domains as row (row.domain)}
									<li>
										<div class="panelBarRow">
											<span class="panelBarLabel mono" title={row.domain}>{row.domain}</span>
											<span class="panelBarCount mono">{row.count}</span>
										</div>
										<div class="panelBarTrack" aria-hidden="true">
											<div class="panelBarFill panelBarFill--dns" style={`width:${barPct(row.count, maxD)}%`}></div>
										</div>
									</li>
								{/each}
							</ul>
						</div>
						<div>
							<h3 class="h3">Top clientes (Pi-hole)</h3>
							<ul class="panelBarList">
								{#each d.top_clients as row (row.client)}
									<li>
										<div class="panelBarRow">
											<span
												class="panelBarLabel mono"
												title={row.device_label
													? `${row.device_label} · ${row.client}`
													: row.client}
											>
												{row.device_label ?? row.client}
											</span>
											<span class="barMeta mono">
												{row.lan_ip ?? row.resolved_ip ?? '—'}{row.sede_name ? ` · ${row.sede_name}` : ''}
											</span>
											<span class="panelBarCount mono">{row.count}</span>
										</div>
										<div class="panelBarTrack" aria-hidden="true">
											<div class="panelBarFill panelBarFill--dns" style={`width:${barPct(row.count, maxC)}%`}></div>
										</div>
									</li>
								{/each}
							</ul>
						</div>
					</div>
				{/if}
			</div>

			<div class="panel">
				{#if data.audit}
					{@const a = data.audit}
					{@const maxA = Math.max(1, ...Object.values(a.by_action))}
					<h2 class="panel__h2">Auditoría (últimos {data.audit_days} d)</h2>
					<div class="panelStats">
						<div class="panelStat">
							<span class="panelStat__k">Eventos</span>
							<span class="panelStat__v mono">{a.total_events.toLocaleString()}</span>
						</div>
						<div class="panelStat panelStat--warn">
							<span class="panelStat__k">Logins fallidos</span>
							<span class="panelStat__v mono">{a.failed_logins}</span>
						</div>
					</div>
					<h3 class="h3">Por tipo de acción</h3>
					<ul class="panelBarList">
						{#each [...Object.entries(a.by_action)].sort((x, y) => y[1] - x[1]) as [action, count] (action)}
							<li>
								<div class="panelBarRow">
									<span class="panelBarLabel mono">{action}</span>
									<span class="panelBarCount mono">{count}</span>
								</div>
								<div class="panelBarTrack" aria-hidden="true">
									<div class="panelBarFill panelBarFill--aud" style={`width:${barPct(count, maxA)}%`}></div>
								</div>
							</li>
						{/each}
					</ul>
					<p class="panelFoot muted">
						Detalle en <a href="/audit">Auditoría</a>. DNS en vivo en <a href="/dns">DNS</a>. Listas en
						<a href="/pihole/listas">Pi-hole → Listas</a>.
					</p>
				{/if}
			</div>
		</section>
	{/if}
</main>
