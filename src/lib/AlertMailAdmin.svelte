<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api-client';
	import { apiErrorMessage } from '$lib/api-errors';

	let status = $state<{
		configured: boolean;
		host: string | null;
		port: number | null;
		from: string | null;
		recipients_count: number;
		cooldown_min: number;
	} | null>(null);
	let busy = $state(false);
	let msg = $state<string | null>(null);
	let err = $state<string | null>(null);

	onMount(async () => {
		const res = await fetch('/api/admin/mail-status', { headers: { 'cache-control': 'no-cache' } });
		status = res.ok ? await res.json() : null;
	});

	async function testMail() {
		busy = true;
		msg = null;
		err = null;
		const res = await apiFetch('/api/admin/mail-test', { method: 'POST' });
		const body = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, body, 'No se pudo enviar el correo de prueba.');
			return;
		}
		msg = 'Correo de prueba enviado. Revisa la bandeja de ALERT_EMAIL_TO.';
	}
</script>

<section class="panel" aria-labelledby="alert-mail-h">
	<h2 id="alert-mail-h" class="panel__h2">Alertas por correo</h2>
	<p class="muted">
		Configura <code>SMTP_*</code> y <code>ALERT_EMAIL_TO</code> en el <code>.env</code>. El watchdog y el cron de
		seguridad envían avisos con cooldown.
	</p>

	{#if status}
		<ul class="alertMailMeta">
			<li>
				Estado:
				<strong>{status.configured ? 'Listo' : 'Incompleto'}</strong>
			</li>
			{#if status.host}
				<li>SMTP: {status.host}:{status.port}</li>
			{/if}
			{#if status.from}
				<li>Remitente: {status.from}</li>
			{/if}
			<li>Destinatarios: {status.recipients_count}</li>
			<li>Cooldown: {status.cooldown_min} min</li>
		</ul>
	{/if}

	{#if err}
		<p class="formErr" role="alert">{err}</p>
	{/if}
	{#if msg}
		<p class="formOk" role="status">{msg}</p>
	{/if}

	<button type="button" class="btn secondary" disabled={busy || !status?.configured} onclick={testMail}>
		{busy ? 'Enviando…' : 'Enviar correo de prueba'}
	</button>
</section>

<style>
	.alertMailMeta {
		margin: 12px 0 16px;
		padding-left: 1.1rem;
		font-size: 14px;
		line-height: 1.6;
	}
	.formOk {
		color: var(--ok, #16a34a);
		font-size: 14px;
	}
</style>
