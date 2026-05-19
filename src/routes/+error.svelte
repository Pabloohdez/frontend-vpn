<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';

	const status = $derived(page.status);
	const message = $derived(page.error?.message ?? 'Algo no fue como esperaba');

	const friendly = $derived.by(() => {
		if (status === 404) {
			return {
				title: 'Página no encontrada',
				hint: 'La ruta que has pedido no existe en el panel. Puede que sea un enlace antiguo.'
			};
		}
		if (status === 401 || status === 403) {
			return {
				title: 'Acceso denegado',
				hint: 'Tu sesión ha caducado o no tienes permisos para ver esto. Vuelve a iniciar sesión.'
			};
		}
		if (status >= 500) {
			return {
				title: 'Error interno',
				hint: 'El servidor tuvo un problema procesando tu petición. Si persiste, revisa los logs.'
			};
		}
		return {
			title: 'Ha ocurrido un error',
			hint: message
		};
	});

	function back() {
		if (history.length > 1) history.back();
		else goto('/');
	}
</script>

<svelte:head>
	<title>{status} · Panel VPN</title>
</svelte:head>

<main class="errorPage" id="contenido-principal" tabindex="-1">
	<div class="errorCard">
		<div class="errorBadge" aria-hidden="true">{status}</div>
		<h1 class="errorTitle">{friendly.title}</h1>
		<p class="errorMsg">{friendly.hint}</p>
		{#if message && message !== friendly.hint}
			<p class="errorDetail mono" aria-label="Detalle técnico">{message}</p>
		{/if}
		<div class="errorActions">
			<button type="button" class="btn" onclick={back}>← Volver</button>
			<a class="btn primary" href="/">Ir al inicio</a>
		</div>
	</div>
</main>

<style>
	.errorPage {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
		background:
			radial-gradient(1200px 600px at 20% -10%, rgba(13, 148, 136, 0.12), transparent 60%),
			radial-gradient(1200px 600px at 110% 110%, rgba(15, 23, 42, 0.08), transparent 60%);
	}
	.errorCard {
		max-width: 520px;
		width: 100%;
		padding: 32px;
		border-radius: 16px;
		background: #ffffff;
		border: 1px solid #e2e8f0;
		box-shadow: 0 30px 60px -30px rgba(15, 23, 42, 0.25);
		text-align: center;
	}
	.errorBadge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 76px;
		padding: 6px 14px;
		border-radius: 999px;
		background: #0f172a;
		color: #fff;
		font-weight: 700;
		font-family: 'JetBrains Mono', ui-monospace, monospace;
		letter-spacing: 0.04em;
		margin-bottom: 14px;
	}
	.errorTitle {
		margin: 0 0 8px;
		font-size: 24px;
		color: #0f172a;
	}
	.errorMsg {
		margin: 0 0 12px;
		color: #475569;
		line-height: 1.5;
	}
	.errorDetail {
		font-size: 12.5px;
		padding: 8px 10px;
		background: #f1f5f9;
		border: 1px solid #e2e8f0;
		border-radius: 8px;
		color: #475569;
		word-break: break-word;
		text-align: left;
		margin: 0 0 18px;
	}
	.errorActions {
		display: flex;
		gap: 10px;
		justify-content: center;
		flex-wrap: wrap;
	}
	.btn {
		appearance: none;
		text-decoration: none;
		font-size: 14px;
		font-weight: 600;
		padding: 10px 16px;
		border-radius: 8px;
		border: 1px solid #cbd5e1;
		background: #ffffff;
		color: #0f172a;
		cursor: pointer;
	}
	.btn:hover { background: #f8fafc; }
	.btn.primary {
		border-color: #0d9488;
		background: #0d9488;
		color: #fff;
	}
	.btn.primary:hover { background: #0f766e; border-color: #0f766e; }
	.mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
</style>
