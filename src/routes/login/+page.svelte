<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { loginErrorMessage } from '$lib/api-errors';
	import './page.css';

	let password = $state('');
	let totp = $state('');
	let busy = $state(false);
	let err = $state<string | null>(null);

	let next = $state<string>('/');

	onMount(() => {
		const url = new URL(window.location.href);
		next = url.searchParams.get('next') || '/';
	});

	async function login() {
		if (busy) return;
		busy = true;
		err = null;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ password, totp: totp || undefined })
			});
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				err = loginErrorMessage(res.status, j);
				return;
			}
			password = '';
			totp = '';
			await goto(next);
			// fallback: fuerza reload por cookies
			window.location.reload();
		} finally {
			busy = false;
		}
	}
</script>

<main class="pageWrap pageWide page-login" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<a class="settingsBack" href="/">← Inicio</a>
			<h1 class="panelHero__title">Iniciar sesión</h1>
			<p class="panelHero__sub">Acceso al panel (Pi-hole, seguridad y OpenVPN).</p>
		</div>
	</header>

	<section class="panel loginPanel">
		<label class="loginField">
			<span class="muted">Contraseña</span>
			<input
				class="input"
				type="password"
				autocomplete="current-password"
				placeholder="Contraseña admin / operator / auditor"
				bind:value={password}
				onkeydown={(e) => e.key === 'Enter' && login()}
			/>
		</label>
		<label class="loginField">
			<span class="muted">TOTP (solo admin con 2FA)</span>
			<input
				class="input mono"
				autocomplete="one-time-code"
				placeholder="123456 o recovery-code"
				bind:value={totp}
				onkeydown={(e) => e.key === 'Enter' && login()}
			/>
		</label>

		<button type="button" class="btn btnAccent" onclick={login} disabled={busy || !password.trim()}>
			{busy ? 'Entrando…' : 'Entrar'}
		</button>

		{#if err}
			<p class="muted" style="margin-top:10px">{err}</p>
		{/if}
	</section>
</main>

