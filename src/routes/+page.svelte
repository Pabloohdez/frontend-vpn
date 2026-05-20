<script lang="ts">
	import './launcher.css';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
	import { onMount } from 'svelte';

	let auth = $state<{ role?: string | null; configured?: boolean } | null>(null);
	let password = $state('');
	let totp = $state('');
	let busy = $state(false);
	let err = $state<string | null>(null);

	onMount(async () => {
		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
		auth = res && res.ok ? await res.json() : { role: null, configured: false };
	});

	async function login() {
		if (busy) return;
		busy = true;
		err = null;
		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ password, totp: totp || undefined })
		});
		const j = await res.json().catch(() => null);
		if (!res.ok) {
			err =
				j?.error === 'totp_required'
					? '2FA requerido: introduce el código TOTP o un recovery code.'
					: res.status === 429
						? 'Demasiados intentos. Espera un momento.'
						: 'Credenciales inválidas';
			busy = false;
			return;
		}
		password = '';
		totp = '';
		window.location.reload();
	}
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
				<div class="launcherLogin__row">
					<input
						class="input"
						type="password"
						autocomplete="current-password"
						placeholder="Contraseña admin / operator / auditor"
						bind:value={password}
						onkeydown={(e) => e.key === 'Enter' && login()}
					/>
					<input
						class="input mono"
						autocomplete="one-time-code"
						placeholder="TOTP (solo admin con 2FA)"
						bind:value={totp}
						onkeydown={(e) => e.key === 'Enter' && login()}
					/>
					<button type="button" class="btn btnAccent" onclick={login} disabled={busy || !password.trim()}>
						{busy ? 'Entrando…' : 'Entrar'}
					</button>
				</div>
				{#if err}
					<p class="muted" style="margin-top:8px">{err}</p>
				{/if}
			</section>
		{/if}

		<div class="launcher__cards" role="navigation" aria-label="Módulos del panel">
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
