<script lang="ts">
	import { onMount } from 'svelte';
	import { logoutAndGoHome } from '$lib/logout-client';
	import './page.css';

	let auth = $state<{
		configured: boolean;
		isAdmin: boolean;
		role?: string | null;
	} | null>(null);
	let loggingOut = $state(false);

	onMount(async () => {
		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
		auth = res.ok ? await res.json() : { configured: false, isAdmin: false };
	});

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		auth = auth ? { ...auth, role: null, isAdmin: false } : auth;
		await logoutAndGoHome();
	}

	const envGroups = [
		{
			title: 'OpenVPN (VM1)',
			vars: ['VPN_API_BASE_URL', 'VPN_API_KEY', 'VPN_VM1_BUNDLE_PATH_TEMPLATE']
		},
		{
			title: 'Autenticación del panel',
			vars: [
				'SESSION_SECRET',
				'COOKIE_SECURE',
				'ADMIN_PASSWORD / ADMIN_PASSWORD_PBKDF2',
				'AUDITOR_PASSWORD / AUDITOR_PASSWORD_PBKDF2'
			]
		},
		{
			title: 'Pi-hole',
			vars: ['PIHOLE_BASE_URL', 'PIHOLE_API_TOKEN']
		},
		{
			title: 'Inventario de red (netmonitor)',
			vars: ['NETMONITOR_BASE_URL', 'NETMONITOR_API_KEY']
		},
		{
			title: 'Auditoría',
			vars: ['AUDIT_DB_PATH']
		}
	] as const;
</script>

<main class="pageWrap pageWide page-settings" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<a href="/" class="settingsBack">← Inicio</a>
			<h1 class="panelHero__title">Ajustes</h1>
			<p class="panelHero__sub">Sesión, documentación y enlaces de administración.</p>
		</div>
	</header>

	<section class="panel settingsQuick">
		<h2 class="panel__h2">Accesos rápidos</h2>
		<div class="settingsQuick__grid">
			<a href="/audit" class="settingsQuick__card settingsQuick__card--audit">
				<span class="settingsQuick__label">Auditoría</span>
				<span class="settingsQuick__hint muted">Quién hizo qué y cuándo</span>
			</a>
			<a href="/status" class="settingsQuick__card">
				<span class="settingsQuick__label">Estado del sistema</span>
				<span class="settingsQuick__hint muted">VM1, VM2 y Pi-hole</span>
			</a>
			<a href="/privacy" class="settingsQuick__card">
				<span class="settingsQuick__label">Privacidad</span>
				<span class="settingsQuick__hint muted">Documentación interna</span>
			</a>
		</div>
	</section>

	<section class="panel">
		<h2 class="panel__h2">Sesión</h2>
		{#if auth === null}
			<p class="muted">Comprobando sesión…</p>
		{:else if !auth.configured}
			<p class="muted">La autenticación no está configurada en el servidor (.env).</p>
		{:else}
			<p>
				Rol actual:
				<strong>{auth.role ?? 'sin sesión'}</strong>
				{#if auth.isAdmin}
					<span class="muted"> (administrador)</span>
				{:else if auth.role === 'auditor'}
					<span class="muted"> (auditor, solo lectura en listas)</span>
				{/if}
			</p>
			{#if auth.role}
				<button type="button" class="btn secondary" onclick={logout} disabled={loggingOut}>
					{loggingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
				</button>
			{:else}
				<p class="muted">Inicia sesión desde OpenVPN o Pi-hole con tu contraseña de admin o auditor.</p>
			{/if}
		{/if}
	</section>

	<section class="panel">
		<h2 class="panel__h2">Configuración del servidor</h2>
		<p class="muted settingsNote">
			Estas variables se definen en el archivo <code class="mono">.env</code> del proceso que ejecuta este panel
			(no se editan desde la interfaz). Consulta <code class="mono">.env.example</code> en el repositorio.
		</p>
		<ul class="envList">
			{#each envGroups as g (g.title)}
				<li>
					<strong>{g.title}</strong>
					<ul>
						{#each g.vars as v (v)}
							<li class="mono">{v}</li>
						{/each}
					</ul>
				</li>
			{/each}
		</ul>
	</section>
</main>
