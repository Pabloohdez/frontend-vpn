<script lang="ts">
	import { loginHref } from '$lib/auth-client';

	let {
		message = 'Necesitas iniciar sesión para ver esta página.',
		nextPath
	}: {
		message?: string;
		nextPath?: string;
	} = $props();

	const href = $derived(loginHref(nextPath));
</script>

<section class="panel authGate" aria-label="Sesión requerida">
	<h2 class="panel__h2">Sesión requerida</h2>
	<p class="muted authGate__msg">{message}</p>
	<div class="authGate__actions">
		<a class="btn btnAccent" href={href}>Iniciar sesión</a>
		<a class="btn secondary" href="/">Volver al inicio</a>
	</div>
</section>

<style>
	.authGate {
		max-width: 520px;
		margin: 0 auto 24px;
		text-align: center;
	}
	.authGate__msg {
		margin: 0 0 16px;
		line-height: 1.45;
	}
	.authGate__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		justify-content: center;
	}
</style>
