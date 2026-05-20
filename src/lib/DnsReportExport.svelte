<script lang="ts">
	import { todayLocalIso } from '$lib/dns-report-utils';
	import AuthGate from '$lib/AuthGate.svelte';
	import { describeFetchResponse } from '$lib/api-errors';

	let {
		clientHint = '',
		busy = false
	}: {
		clientHint?: string;
		busy?: boolean;
	} = $props();

	let reportDay = $state(todayLocalIso());
	let reportClient = $state('');
	let exporting = $state(false);
	let error = $state<string | null>(null);
	let needsAuth = $state(false);

	$effect(() => {
		if (clientHint && !reportClient) reportClient = clientHint;
	});

	async function exportPdf() {
		error = null;
		needsAuth = false;
		exporting = true;
		const params = new URLSearchParams({ day: reportDay.trim() });
		const client = reportClient.trim();
		if (client) params.set('client', client);

		try {
			const res = await fetch(`/api/admin/dns/report?${params}`, {
				headers: { 'cache-control': 'no-cache' }
			});
			if (!res.ok) {
				const fail = await describeFetchResponse(res, 'No se pudo generar el informe PDF.');
				needsAuth = fail.needsAuth;
				error = fail.message;
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download =
				res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ??
				`informe-dns-${reportDay}.pdf`;
			a.click();
			queueMicrotask(() => URL.revokeObjectURL(url));
		} catch (e: unknown) {
			error = String((e as Error)?.message ?? e);
		} finally {
			exporting = false;
		}
	}
</script>

<div class="dnsReport">
	<p class="dnsReport__title">Informe PDF por dispositivo</p>
	<p class="dnsReport__hint muted">
		Genera un PDF con las consultas DNS de cada dispositivo en el día elegido (hora local del servidor).
	</p>
	<div class="dnsReport__row">
		<label class="dnsReport__field">
			<span class="dnsReport__lab">Día</span>
			<input class="input" type="date" bind:value={reportDay} disabled={exporting || busy} />
		</label>
		<label class="dnsReport__field dnsReport__field--grow">
			<span class="dnsReport__lab">Dispositivo (opcional)</span>
			<input
				class="input"
				type="search"
				placeholder="IP, nombre, CN o cliente Pi-hole"
				bind:value={reportClient}
				disabled={exporting || busy}
				autocomplete="off"
			/>
		</label>
		<button
			type="button"
			class="btn btnAccent dnsReport__btn"
			disabled={exporting || busy || !reportDay}
			aria-busy={exporting}
			onclick={exportPdf}
		>
			{exporting ? 'Generando…' : 'Exportar PDF'}
		</button>
	</div>
	{#if needsAuth}
		<div class="dnsReport__authGate">
			<AuthGate message={error ?? undefined} nextPath="/dns" />
		</div>
	{:else if error}
		<p class="dnsReport__error" role="alert">{error}</p>
	{/if}
</div>

<style>
	.dnsReport {
		margin-top: 14px;
		padding-top: 14px;
		border-top: 1px solid var(--border-subtle);
	}

	.dnsReport__title {
		margin: 0 0 4px;
		font-size: 13px;
		font-weight: 650;
	}

	.dnsReport__hint {
		margin: 0 0 10px;
		font-size: 12px;
		line-height: 1.45;
	}

	.dnsReport__row {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
		align-items: flex-end;
	}

	.dnsReport__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 10rem;
	}

	.dnsReport__field--grow {
		flex: 1 1 12rem;
		min-width: 12rem;
	}

	.dnsReport__lab {
		font-size: 11px;
		color: var(--text-muted);
	}

	.dnsReport__btn {
		flex-shrink: 0;
	}

	.dnsReport__error {
		margin: 10px 0 0;
		font-size: 12px;
		color: var(--danger, #c44);
	}

	.dnsReport__authGate :global(.authGate) {
		margin: 12px 0 0;
		max-width: none;
		text-align: left;
	}

	.dnsReport__authGate :global(.authGate__actions) {
		justify-content: flex-start;
	}
</style>
