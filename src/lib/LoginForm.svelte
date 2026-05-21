<script lang="ts">
	import { loginErrorMessage } from '$lib/api-errors';

	let {
		compact = false,
		onSuccess
	}: {
		compact?: boolean;
		/** Si no se pasa, recarga la página (home). */
		onSuccess?: () => void | Promise<void>;
	} = $props();

	let step = $state<'password' | 'totp'>('password');
	let username = $state('');
	let password = $state('');
	let totpCode = $state('');
	let busy = $state(false);
	let err = $state<string | null>(null);

	async function submit() {
		if (busy) return;
		if (step === 'password' && !password.trim()) return;
		if (step === 'totp' && !totpCode.trim()) return;

		busy = true;
		err = null;
		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					username: username.trim() || undefined,
					password,
					totp: step === 'totp' ? totpCode.trim() : undefined
				})
			});
			const j = await res.json().catch(() => null);

			if (!res.ok) {
				if (step === 'password' && j?.error === 'totp_required') {
					step = 'totp';
					err = null;
					return;
				}
				err = loginErrorMessage(res.status, j);
				return;
			}

			password = '';
			totpCode = '';
			step = 'password';
			if (onSuccess) await onSuccess();
			else window.location.reload();
		} finally {
			busy = false;
		}
	}

	function backToPassword() {
		step = 'password';
		totpCode = '';
		err = null;
	}
</script>

<div class="loginForm" class:loginForm--compact={compact}>
	{#if step === 'password'}
		<label class="loginForm__field">
			{#if !compact}<span class="muted">Usuario</span>{/if}
			<input
				class="input"
				type="text"
				autocomplete="username"
				placeholder="Usuario (ej. admin o el que creaste)"
				bind:value={username}
				onkeydown={(e) => e.key === 'Enter' && submit()}
			/>
		</label>
		<label class="loginForm__field">
			{#if !compact}<span class="muted">Contraseña</span>{/if}
			<input
				class="input"
				type="password"
				autocomplete="current-password"
				placeholder="Contraseña"
				bind:value={password}
				onkeydown={(e) => e.key === 'Enter' && submit()}
			/>
		</label>
		<button
			type="button"
			class="btn btnAccent"
			disabled={busy || !password.trim()}
			onclick={submit}
		>
			{busy ? 'Entrando…' : 'Entrar'}
		</button>
	{:else}
		<p class="loginForm__hint muted">
			Tu cuenta admin tiene <strong>2FA activo</strong>. Abre la app de autenticación (Google Authenticator, etc.) e
			introduce el código de 6 dígitos.
		</p>
		<label class="loginForm__field">
			<span class="muted">Código 2FA</span>
			<input
				class="input mono"
				type="text"
				inputmode="numeric"
				autocomplete="one-time-code"
				placeholder="123456"
				bind:value={totpCode}
				onkeydown={(e) => e.key === 'Enter' && submit()}
			/>
		</label>
		<div class="loginForm__actions">
			<button type="button" class="btn btnAccent" disabled={busy || !totpCode.trim()} onclick={submit}>
				{busy ? 'Comprobando…' : 'Verificar y entrar'}
			</button>
			<button type="button" class="btn secondary" disabled={busy} onclick={backToPassword}>
				Volver
			</button>
		</div>
		<p class="loginForm__subhint muted">
			Si perdiste el móvil, usa un <strong>recovery code</strong> (el que guardaste al activar el 2FA).
		</p>
	{/if}

	{#if err}
		<p class="loginForm__err" role="alert">{err}</p>
	{/if}
</div>

<style>
	.loginForm {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.loginForm--compact {
		flex-direction: row;
		flex-wrap: wrap;
		align-items: flex-end;
	}
	.loginForm--compact .loginForm__field {
		flex: 1 1 12rem;
		min-width: 10rem;
	}
	.loginForm__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.loginForm__hint {
		margin: 0;
		font-size: 13px;
		line-height: 1.45;
	}
	.loginForm__subhint {
		margin: 0;
		font-size: 12px;
		line-height: 1.4;
	}
	.loginForm__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.loginForm__err {
		margin: 0;
		width: 100%;
		font-size: 13px;
		color: var(--danger, #b91c1c);
	}
</style>
