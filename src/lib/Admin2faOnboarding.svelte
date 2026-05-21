<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';
	import { csrfHeaders } from '$lib/csrf-client';
	import { apiErrorMessage } from '$lib/api-errors';
	import { logoutAndGoHome } from '$lib/logout-client';

	const DECLINE_KEY = 'panel_2fa_decline';

	let open = $state(false);
	let required = $state(false);
	let phase = $state<'ask' | 'setup' | 'done'>('ask');
	let busy = $state(false);
	let err = $state<string | null>(null);
	let setup = $state<{ qr_svg: string; recovery_codes: string[] } | null>(null);
	let verifyCode = $state('');
	let codesCopied = $state(false);

	onMount(async () => {
		if (!browser) return;

		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } }).catch(() => null);
		if (!res?.ok) return;
		const me = (await res.json()) as {
			isAdmin?: boolean;
			role?: string | null;
			totp?: { enabled: boolean; required?: boolean } | null;
			admin2faRequired?: boolean;
		};
		if (!me.isAdmin || me.role !== 'admin' || me.totp?.enabled) return;

		required = Boolean(me.admin2faRequired ?? me.totp?.required);
		if (!required && sessionStorage.getItem(DECLINE_KEY)) return;

		open = true;
	});

	function decline() {
		if (required) {
			void logoutAndGoHome();
			return;
		}
		sessionStorage.setItem(DECLINE_KEY, '1');
		open = false;
	}

	async function startSetup() {
		busy = true;
		err = null;
		try {
			const res = await fetch('/api/admin/2fa/setup', { headers: { 'cache-control': 'no-cache' } });
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				err = apiErrorMessage(res.status, j, 'No se pudo preparar el 2FA.');
				return;
			}
			setup = { qr_svg: j.qr_svg, recovery_codes: j.recovery_codes ?? [] };
			phase = 'setup';
			codesCopied = false;
		} catch (e) {
			err = e instanceof Error ? e.message : 'Error de red';
		} finally {
			busy = false;
		}
	}

	async function copyRecoveryCodes() {
		if (!setup?.recovery_codes.length) return;
		try {
			await navigator.clipboard.writeText(setup.recovery_codes.join('\n'));
			codesCopied = true;
		} catch {
			codesCopied = false;
		}
	}

	async function activate() {
		if (!verifyCode.trim()) return;
		busy = true;
		err = null;
		try {
			const res = await fetch('/api/admin/2fa/enable', {
				method: 'POST',
				headers: { 'content-type': 'application/json', ...csrfHeaders() },
				body: JSON.stringify({ code: verifyCode.trim() })
			});
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				err = apiErrorMessage(res.status, j, 'Código incorrecto. Comprueba la app e inténtalo de nuevo.');
				return;
			}
			sessionStorage.removeItem(DECLINE_KEY);
			phase = 'done';
		} catch (e) {
			err = e instanceof Error ? e.message : 'Error de red';
		} finally {
			busy = false;
		}
	}

	function finish() {
		open = false;
		window.location.reload();
	}
</script>

{#if open}
	<div class="twofaOverlay" role="presentation">
		<div
			class="twofaModal panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="twofa-title"
			tabindex="-1"
		>
			{#if phase === 'ask'}
				<h2 id="twofa-title" class="panel__h2">
					{required ? '2FA obligatorio para administradores' : '¿Activar verificación en dos pasos?'}
				</h2>
				<p class="muted twofaModal__p">
					{#if required}
						Debes configurar la verificación en dos pasos para seguir usando el panel como
						<strong>admin</strong>. Necesitarás una app (Google Authenticator, Aegis, etc.) y guardar los
						recovery codes.
					{:else}
						Recomendado para la cuenta <strong>admin</strong>: además de la contraseña, hará falta un código de tu
						móvil. Puedes configurarlo ahora o más tarde en <a href="/ajustes">Ajustes</a>.
					{/if}
				</p>
				<div class="twofaModal__actions">
					<button type="button" class="btn btnAccent" disabled={busy} onclick={startSetup}>
						{busy ? 'Preparando…' : required ? 'Comenzar configuración' : 'Sí, configurar ahora'}
					</button>
					{#if !required}
						<button type="button" class="btn secondary" disabled={busy} onclick={decline}>
							Ahora no
						</button>
					{:else}
						<button type="button" class="btn secondary" disabled={busy} onclick={decline}>
							Cerrar sesión
						</button>
					{/if}
				</div>
			{:else if phase === 'setup' && setup}
				<h2 id="twofa-title" class="panel__h2">Configura tu 2FA</h2>
				<ol class="twofaSteps muted">
					<li>Instala una app de autenticación si no tienes (Google Authenticator, Aegis, etc.).</li>
					<li>Escanea este QR con la app:</li>
				</ol>
				<div class="twofaModal__qr" aria-label="Código QR 2FA">
					{@html setup.qr_svg}
				</div>
				<div class="twofaModal__codes">
					<p class="muted twofaModal__warn">
						<strong>Guarda estos recovery codes</strong> en un sitio seguro. Cada uno sirve una sola vez si pierdes
						el móvil.
					</p>
					<ul class="mono twofaModal__codeList">
						{#each setup.recovery_codes as c (c)}
							<li>{c}</li>
						{/each}
					</ul>
					<button type="button" class="btn btnMini secondary" onclick={copyRecoveryCodes}>
						{codesCopied ? 'Copiados ✓' : 'Copiar códigos'}
					</button>
				</div>
				<label class="twofaModal__field">
					<span class="muted">Paso 3: introduce el código de 6 dígitos de la app</span>
					<input
						class="input mono"
						placeholder="123456"
						inputmode="numeric"
						bind:value={verifyCode}
						onkeydown={(e) => e.key === 'Enter' && activate()}
					/>
				</label>
				<div class="twofaModal__actions">
					<button
						type="button"
						class="btn btnAccent"
						disabled={busy || !verifyCode.trim()}
						onclick={activate}
					>
						{busy ? 'Activando…' : 'Activar 2FA'}
					</button>
					<button type="button" class="btn secondary" disabled={busy} onclick={decline}>
						{required ? 'Cerrar sesión' : 'Cancelar'}
					</button>
				</div>
			{:else if phase === 'done'}
				<h2 id="twofa-title" class="panel__h2">2FA activado</h2>
				<p class="muted twofaModal__p">
					A partir del próximo inicio de sesión te pediremos la contraseña y después el código de la app (o un
					recovery code).
				</p>
				<button type="button" class="btn btnAccent" onclick={finish}>Entendido</button>
			{/if}

			{#if err}
				<p class="twofaModal__err" role="alert">{err}</p>
			{/if}
		</div>
	</div>
{/if}

<style>
	.twofaOverlay {
		position: fixed;
		inset: 0;
		z-index: 9000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
		background: rgba(15, 23, 42, 0.55);
		backdrop-filter: blur(4px);
	}
	.twofaModal {
		max-width: 480px;
		width: 100%;
		max-height: 90vh;
		overflow: auto;
		margin: 0;
	}
	.twofaModal__p {
		margin: 0 0 16px;
		line-height: 1.5;
		font-size: 14px;
	}
	.twofaModal__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		margin-top: 12px;
	}
	.twofaSteps {
		margin: 0 0 12px;
		padding-left: 1.2rem;
		font-size: 13px;
		line-height: 1.5;
	}
	.twofaModal__qr {
		display: flex;
		justify-content: center;
		margin: 12px 0;
		padding: 12px;
		background: #fff;
		border-radius: 10px;
	}
	.twofaModal__qr :global(svg) {
		max-width: 200px;
		height: auto;
	}
	.twofaModal__codes {
		margin-bottom: 14px;
	}
	.twofaModal__warn {
		margin: 0 0 8px;
		font-size: 13px;
	}
	.twofaModal__codeList {
		margin: 0 0 10px;
		padding-left: 1.2rem;
		font-size: 12px;
		line-height: 1.6;
	}
	.twofaModal__field {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin-bottom: 8px;
	}
	.twofaModal__err {
		margin: 12px 0 0;
		font-size: 13px;
		color: var(--danger, #b91c1c);
	}
</style>
