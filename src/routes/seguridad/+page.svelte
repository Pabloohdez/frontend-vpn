<script lang="ts">
	import { onMount } from 'svelte';
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
		alerts?: SecurityAlert[];
	};

	let loading = $state(true);
	let error = $state<string | null>(null);
	let data = $state<Payload | null>(null);
	let windowHours = $state(24);

	function barPct(count: number, max: number) {
		if (!max) return 0;
		return Math.round((100 * count) / max);
	}

	async function load() {
		loading = data === null;
		error = null;
		const res = await fetch(`/api/admin/security-insights?window_hours=${windowHours}`, {
			headers: { 'cache-control': 'no-cache' }
		});
		if (!res.ok) {
			error = res.status === 401 ? 'Necesitas sesión de administrador o auditor' : `Error ${res.status}`;
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
			<button type="button" class="btn secondary btnAccent" disabled={loading} onclick={load}>
				{loading ? 'Cargando…' : 'Actualizar'}
			</button>
		</div>
	</header>

	{#if error}
		<section class="panel cardError">{error}</section>
	{:else if loading && !data}
		<section class="panel panel--loading"><p class="muted">Cargando métricas…</p></section>
	{:else if data}
		{#if data.alerts && data.alerts.length > 0}
			<section class="panel secAlerts" aria-label="Alertas de seguridad">
				<h2 class="panel__h2">Alertas</h2>
				<ul class="secAlerts__list">
					{#each data.alerts as alert (alert.id)}
						<li class="secAlert secAlert--{alert.severity}">
							<strong class="secAlert__title">{alert.title}</strong>
							<p class="secAlert__detail muted">{alert.detail}</p>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.anomalies && data.anomalies.length > 0}
			<section class="panel secAnoms" aria-label="Anomalías de actividad DNS">
				<h2 class="panel__h2">Anomalías DNS</h2>
				<p class="muted secAnoms__hint">
					Dispositivos con actividad muy superior a su media de los últimos 7 días.
				</p>
				<ul class="secAnoms__list">
					{#each data.anomalies as a (a.client)}
						<li class="secAnom secAnom--{a.severity}">
							<div class="secAnom__head">
								<strong class="secAnom__name">{a.label ?? a.client}</strong>
								<span class="secAnom__mult mono">
									{Number.isFinite(a.multiplier) ? `×${a.multiplier}` : 'nuevo'}
								</span>
							</div>
							<div class="secAnom__meta muted">
								<span class="mono">{a.client}</span>
								·
								<span>
									{a.current.toLocaleString('es-ES')} consultas
									{#if a.baseline_avg > 0}
										vs ≈ {a.baseline_avg.toLocaleString('es-ES')} habituales
									{:else}
										(sin historial reciente)
									{/if}
								</span>
								·
								<a href={`/dns?device_ip=${encodeURIComponent(a.client)}`}>Ver consultas</a>
							</div>
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
