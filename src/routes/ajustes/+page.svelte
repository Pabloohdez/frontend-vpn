<script lang="ts">
	import { onMount } from 'svelte';
	import { logoutAndGoHome } from '$lib/logout-client';
	import { csrfHeaders } from '$lib/csrf-client';
	import { apiErrorMessage, describeFetchResponse } from '$lib/api-errors';
	import PanelUsersAdmin from '$lib/PanelUsersAdmin.svelte';
	import CategoryPoliciesAdmin from '$lib/CategoryPoliciesAdmin.svelte';
	import './page.css';

	let auth = $state<{
		configured: boolean;
		isAdmin: boolean;
		role?: string | null;
	} | null>(null);
	let loggingOut = $state(false);
	let downloadingBackup = $state(false);
	let backupError = $state<string | null>(null);
	let totp = $state<{ enabled: boolean; created_at: string | null } | null>(null);
	let totpSetup = $state<{ qr_svg: string; recovery_codes: string[] } | null>(null);
	let totpCode = $state('');
	let totpBusy = $state(false);
	let totpError = $state<string | null>(null);
	let cats = $state<{ categories: any[]; policies: any[] } | null>(null);
	let catsError = $state<string | null>(null);

	onMount(async () => {
		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
		auth = res.ok ? await res.json() : { configured: false, isAdmin: false };
		if (auth?.isAdmin) {
			const s = await fetch('/api/admin/2fa/status', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
			totp = s && s.ok ? await s.json() : null;
		}
		// categorías (admin/operator/auditor pueden ver; editar se limita en API)
		await loadCategories();
	});

	async function logout() {
		if (loggingOut) return;
		loggingOut = true;
		auth = auth ? { ...auth, role: null, isAdmin: false } : auth;
		await logoutAndGoHome();
	}

	async function loadCategories() {
		catsError = null;
		const c = await fetch('/api/admin/categories', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
		if (!c) {
			catsError = 'No se pudo cargar categorías';
			cats = null;
			return;
		}
		if (!c.ok) {
			const fail = await describeFetchResponse(c, 'No se pudo cargar categorías.');
			catsError = fail.message;
			cats = null;
			return;
		}
		cats = await c.json();
	}

	async function downloadBackup() {
		if (downloadingBackup) return;
		downloadingBackup = true;
		backupError = null;
		try {
			const res = await fetch('/api/admin/backup', { headers: { 'cache-control': 'no-cache' } });
			if (!res.ok) {
				const fail = await describeFetchResponse(res, 'No se pudo generar el backup.');
				backupError = fail.message;
				downloadingBackup = false;
				return;
			}
			const blob = await res.blob();
			const cd = res.headers.get('content-disposition') ?? '';
			const match = /filename=\"?([^\";]+)\"?/i.exec(cd);
			const filename = match?.[1] ?? 'panel-backup.json';
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		} catch (e) {
			backupError = e instanceof Error ? e.message : 'No se pudo descargar el backup';
		} finally {
			downloadingBackup = false;
		}
	}

	async function start2faSetup() {
		if (totpBusy) return;
		totpBusy = true;
		totpError = null;
		try {
			const res = await fetch('/api/admin/2fa/setup', { headers: { 'cache-control': 'no-cache' } });
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				totpError = apiErrorMessage(res.status, j, 'No se pudo iniciar la configuración 2FA.');
				return;
			}
			totpSetup = { qr_svg: j.qr_svg, recovery_codes: j.recovery_codes };
		} catch (e) {
			totpError = e instanceof Error ? e.message : 'No se pudo iniciar 2FA';
		} finally {
			totpBusy = false;
		}
	}

	async function enable2fa() {
		if (totpBusy) return;
		totpBusy = true;
		totpError = null;
		try {
			const res = await fetch('/api/admin/2fa/enable', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...csrfHeaders() },
				body: JSON.stringify({ code: totpCode })
			});
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				totpError = apiErrorMessage(res.status, j, 'No se pudo activar 2FA.');
				return;
			}
			totp = j.status;
			totpSetup = null;
			totpCode = '';
		} catch (e) {
			totpError = e instanceof Error ? e.message : 'No se pudo activar 2FA';
		} finally {
			totpBusy = false;
		}
	}

	async function saveCategoryDomains(id: string, raw: string) {
		const domains = raw
			.split('\n')
			.map((x) => x.trim())
			.filter(Boolean);
		const res = await fetch('/api/admin/categories', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({ type: 'domains', category_id: id, domains })
		});
		const j = await res.json().catch(() => null);
		if (!res.ok) {
			catsError = apiErrorMessage(res.status, j, 'No se pudieron guardar los dominios.');
			return;
		}
		catsError = null;
		await loadCategories();
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
				<p class="muted">
					Inicia sesión en <a href="/login">/login</a> con usuario y contraseña.
				</p>
			{/if}
		{/if}
	</section>

	{#if auth?.isAdmin}
		<PanelUsersAdmin />
	{/if}

	<section class="panel">
		<h2 class="panel__h2">Verificación en dos pasos (2FA)</h2>
		<p class="muted settingsNote">
			Al iniciar sesión como admin sin 2FA, el panel te ofrece activarlo. Si ya lo tienes, en cada login pedirá el código
			de la app después de la contraseña.
		</p>
		{#if !auth?.isAdmin}
			<p class="muted">Solo el rol admin puede configurar 2FA.</p>
		{:else if totp === null}
			<p class="muted">Cargando estado…</p>
		{:else if totp.enabled}
			<p>
				Estado: <strong>Activo</strong>
				{#if totp.created_at}<span class="muted"> (desde {totp.created_at.slice(0, 10)})</span>{/if}
			</p>
			<p class="muted">Para reconfigurar hay que desactivarlo en el servidor (contacta con quien administra el panel).</p>
		{:else}
			<p>Estado: <strong>No configurado</strong></p>
			<p class="muted">
				Cierra sesión y vuelve a entrar como admin, o pulsa el botón para repetir el asistente aquí.
			</p>
			<button
				type="button"
				class="btn secondary"
				onclick={() => {
					sessionStorage.removeItem('panel_2fa_decline');
					window.location.reload();
				}}
			>
				Mostrar asistente de activación
			</button>
			{#if totpSetup}
				<div class="settings2fa">
					<div class="settings2fa__qr" aria-label="QR 2FA">
						{@html totpSetup.qr_svg}
					</div>
					<div class="settings2fa__codes">
						<strong>Recovery codes</strong>
						<ul class="mono">
							{#each totpSetup.recovery_codes as c (c)}
								<li>{c}</li>
							{/each}
						</ul>
						<label class="settings2fa__field">
							<span>Código de la app</span>
							<input class="input mono" placeholder="123456" bind:value={totpCode} />
						</label>
						<button type="button" class="btn btnAccent" onclick={enable2fa} disabled={totpBusy || !totpCode.trim()}>
							{totpBusy ? 'Activando…' : 'Activar 2FA'}
						</button>
					</div>
				</div>
			{:else}
				<button type="button" class="btn btnAccent" onclick={start2faSetup} disabled={totpBusy}>
					{totpBusy ? 'Preparando…' : 'Configurar 2FA manualmente'}
				</button>
			{/if}
			{#if totpError}
				<p class="settingsErr" role="alert">{totpError}</p>
			{/if}
		{/if}
	</section>

	<section class="panel">
		<h2 class="panel__h2">Backups</h2>
		<p class="muted settingsNote">
			Descarga un export <strong>solo de datos locales del panel</strong> (auditoría, bloqueos, horarios, alias).
			No incluye tokens ni variables <code class="mono">.env</code>.
		</p>
		{#if auth?.isAdmin}
			<button type="button" class="btn secondary" onclick={downloadBackup} disabled={downloadingBackup}>
				{downloadingBackup ? 'Generando…' : 'Descargar backup (.json)'}
			</button>
			{#if backupError}
				<p class="settingsErr" role="alert">{backupError}</p>
			{/if}
		{:else}
			<p class="muted">Solo el rol admin puede descargar backups.</p>
		{/if}
	</section>

	<section class="panel">
		<h2 class="panel__h2">Categorías (Pi-hole)</h2>
		<p class="muted settingsNote">
			Define dominios por categoría. Los horarios por dispositivo se aplican asignando grupos <code class="mono">panel-cat-*</code> en Pi-hole v6.
		</p>
		{#if catsError}
			<p class="settingsErr" role="alert">{catsError}</p>
		{/if}
		{#if cats === null}
			<p class="muted">Cargando…</p>
		{:else}
			<div class="settingsCats">
				{#each cats.categories as c (c.id)}
					<details class="settingsCats__cat">
						<summary>
							<strong>{c.label}</strong>
							<span class="muted">({(c.domains?.length ?? 0).toLocaleString('es-ES')} dominios)</span>
						</summary>
						<p class="muted" style="margin:6px 0 8px">Un dominio por línea (exacto). Ej: <code class="mono">tiktok.com</code></p>
						<textarea class="textarea mono" rows="6" value={(c.domains ?? []).join('\n')}></textarea>
						<div style="margin-top:8px">
							<button
								type="button"
								class="btn secondary"
								onclick={(e) => {
									const ta = (e.currentTarget.parentElement?.previousElementSibling as HTMLTextAreaElement | null);
									saveCategoryDomains(c.id, ta?.value ?? '');
								}}
							>
								Guardar dominios
							</button>
						</div>
					</details>
				{/each}
			</div>
			{#if auth?.isAdmin || auth?.role === 'operator'}
				<CategoryPoliciesAdmin
					categories={cats.categories}
					policies={cats.policies}
					onChange={loadCategories}
				/>
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
