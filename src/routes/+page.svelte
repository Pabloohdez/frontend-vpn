<script lang="ts">
	import './launcher.css';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import LoginForm from '$lib/LoginForm.svelte';
	import { onMount } from 'svelte';

	type AuditRow = {
		ts: string;
		actor: string;
		action: string;
		success?: boolean;
	};
	type SecurityAlert = { id: string; severity: string; title: string };
	type EnvWarning = { id: string; severity: string; message: string };

	let auth = $state<{ role?: string | null; configured?: boolean } | null>(null);
	let overview = $state<{
		vpn_health?: { ok?: boolean };
		pihole_health?: { ok?: boolean };
		security_alert_count?: number;
		security_alerts_preview?: SecurityAlert[];
		recent_audit?: AuditRow[];
		env_warnings?: EnvWarning[];
		vpn_status?: { connected_clients?: unknown[] };
		generated_at?: string;
	} | null>(null);

	const isStaff = $derived(
		auth?.role === 'admin' || auth?.role === 'auditor' || auth?.role === 'operator'
	);

	function fmtAuditTs(ts: string): string {
		try {
			return new Date(ts).toLocaleString('es-ES', {
				day: '2-digit',
				month: '2-digit',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return ts;
		}
	}

	onMount(async () => {
		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
		auth = res && res.ok ? await res.json() : { role: null, configured: false };
		const role = auth?.role;
		if (role === 'admin' || role === 'auditor' || role === 'operator') {
			const o = await fetch('/api/admin/overview', { headers: { 'cache-control': 'no-cache' } }).catch(
				() => null
			);
			overview = o?.ok ? await o.json() : null;
		}
	});
</script>

<main class="launcher" id="contenido-principal" tabindex="-1">
	<header class="launcher__top">
		<span class="launcher__brand">Panel VPN</span>
		<div class="launcher__topActions">
			<ThemeToggle />
			<a href="/ajustes" class="launcher__settings" title="Ajustes" aria-label="Ajustes">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<path
						d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
					/>
					<path
						d="M19.4 15a7.8 7.8 0 0 0 .1-1l2-1.2-2-3.4-2.3.5a8 8 0 0 0-.8-.7L16 6h-4l-.4 2.2a8 8 0 0 0-.9.5l-2.3-.5-2 3.4 2 1.2a7.8 7.8 0 0 0 0 2l-2 1.2 2 3.4 2.3-.5c.3.3.6.6.9.8L12 22h4l.4-2.2c.3-.2.6-.4.9-.6l2.3.5 2-3.4-2-1.2Z"
					/>
				</svg>
			</a>
		</div>
	</header>

	<div class="launcher__body">
		<h1 class="launcher__title">¿Qué quieres gestionar?</h1>
		<p class="launcher__sub muted">Elige un módulo para ver su panel y opciones.</p>

		{#if auth?.configured && !auth?.role}
			<section class="launcherLogin" aria-label="Iniciar sesión">
				<LoginForm compact />
			</section>
		{/if}

		{#if isStaff && overview}
			<section class="launcherOverview" aria-label="Resumen del sistema">
				<div class="launcherOverview__grid">
					<span class="launcherOverview__chip" data-ok={overview.vpn_health?.ok ? '1' : '0'}>
						VM1 {overview.vpn_health?.ok ? 'OK' : 'caído'}
					</span>
					<span class="launcherOverview__chip" data-ok={overview.pihole_health?.ok ? '1' : '0'}>
						Pi-hole {overview.pihole_health?.ok ? 'OK' : 'caído'}
					</span>
					{#if (overview.vpn_status?.connected_clients?.length ?? 0) > 0}
						<span class="launcherOverview__chip">
							{overview.vpn_status?.connected_clients?.length} VPN conectados
						</span>
					{/if}
					{#if (overview.security_alert_count ?? 0) > 0}
						<a class="launcherOverview__chip launcherOverview__chip--warn" href="/seguridad">
							{overview.security_alert_count} alertas (24 h)
						</a>
					{/if}
				</div>

				{#if (overview.env_warnings?.length ?? 0) > 0 && auth?.role === 'admin'}
					<ul class="launcherWarnings">
						{#each overview.env_warnings ?? [] as w (w.id)}
							<li class="launcherWarnings__item" data-sev={w.severity}>{w.message}</li>
						{/each}
					</ul>
				{/if}

				{#if (overview.security_alerts_preview?.length ?? 0) > 0}
					<div class="launcherAlerts">
						<h2 class="launcherAlerts__title">Alertas recientes</h2>
						<ul class="launcherAlerts__list">
							{#each overview.security_alerts_preview ?? [] as a (a.id)}
								<li>
									<a href="/seguridad">{a.title}</a>
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if (overview.recent_audit?.length ?? 0) > 0}
					<div class="launcherActivity">
						<h2 class="launcherActivity__title">Actividad reciente</h2>
						<ul class="launcherActivity__list">
							{#each overview.recent_audit ?? [] as row (row.ts + row.action)}
								<li>
									<span class="mono muted">{fmtAuditTs(row.ts)}</span>
									<span>{row.actor}</span>
									<span class="muted">{row.action}</span>
									{#if row.success === false}
										<span class="launcherActivity__fail">fallo</span>
									{/if}
								</li>
							{/each}
						</ul>
						<a class="launcherActivity__more" href="/audit">Ver auditoría completa</a>
					</div>
				{/if}
			</section>
		{/if}

		<div class="launcher__cards" role="navigation" aria-label="Módulos del panel">
			<a href="/dashboard" class="launcher__card launcher__card--dash">
				<span class="launcher__cardLabel">Dashboard</span>
				<span class="launcher__cardHint muted">Tráfico DNS, patrones y KPIs</span>
			</a>
			<a href="/openvpn" class="launcher__card launcher__card--vpn">
				<span class="launcher__cardLabel">OpenVPN</span>
				<span class="launcher__cardHint muted">Clientes, usuarios y estado VM1</span>
			</a>
			<a href="/pihole" class="launcher__card launcher__card--dns">
				<span class="launcher__cardLabel">Pi-hole</span>
				<span class="launcher__cardHint muted">DNS, listas y seguridad</span>
			</a>
			<a href="/audit" class="launcher__card launcher__card--audit">
				<span class="launcher__cardLabel">Auditoría</span>
				<span class="launcher__cardHint muted">Registro de acciones administrativas</span>
			</a>
		</div>
	</div>
</main>
