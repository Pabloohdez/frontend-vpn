<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api-client';
	import { apiErrorMessage, describeFetchResponse } from '$lib/api-errors';

	type ThreatIntelSyncState = {
		lastSyncAt: string | null;
		lastDomainCount: number;
		lastAdded: number;
		lastError: string | null;
		source: string | null;
	};

	let enabled = $state(false);
	let syncState = $state<ThreatIntelSyncState | null>(null);
	let busy = $state(false);
	let err = $state<string | null>(null);
	let okMsg = $state<string | null>(null);

	async function load() {
		err = null;
		const res = await fetch('/api/admin/threat-intel', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			const fail = await describeFetchResponse(res, 'No se pudo cargar threat intel.');
			err = fail.message;
			return;
		}
		const j = await res.json();
		enabled = Boolean(j.enabled);
		syncState = j.state ?? null;
	}

	async function syncNow() {
		if (busy) return;
		busy = true;
		err = null;
		okMsg = null;
		try {
			const res = await apiFetch('/api/admin/threat-intel', { method: 'POST' });
			const j = await res.json().catch(() => null);
			if (!res.ok) {
				err = apiErrorMessage(res.status, j, 'No se pudo sincronizar URLhaus.');
				return;
			}
			if (j?.skipped) {
				okMsg = j.reason ?? 'Sincronización omitida (activa THREAT_INTEL_ENABLED en .env).';
			} else {
				okMsg = `Añadidos ${j.added ?? 0} dominios (total malware: ${j.total ?? '?'}).`;
			}
			await load();
		} catch (e) {
			err = e instanceof Error ? e.message : 'Error de red';
		} finally {
			busy = false;
		}
	}

	onMount(load);
</script>

<div class="threatIntel">
	<p class="muted settingsNote">
		Importa dominios de malware desde <strong>URLhaus</strong> (Abuse.ch) a la categoría <code class="mono">malware</code>.
		Requiere <code class="mono">THREAT_INTEL_ENABLED=true</code> y <code class="mono">URLHAUS_AUTH_KEY</code> en el
		<code class="mono">.env</code> del servidor.
	</p>
	<p>
		Estado automático:
		<strong>{enabled ? 'Activo' : 'Desactivado'}</strong>
	</p>
	{#if syncState}
		<ul class="muted" style="margin:8px 0;padding-left:1.2rem">
			<li>
				Última sync:
				{syncState.lastSyncAt ? new Date(syncState.lastSyncAt).toLocaleString('es-ES') : 'nunca'}
			</li>
			<li>Dominios en categoría malware: {syncState.lastDomainCount.toLocaleString('es-ES')}</li>
			{#if syncState.lastAdded > 0}
				<li>Última importación: +{syncState.lastAdded.toLocaleString('es-ES')}</li>
			{/if}
			{#if syncState.lastError}
				<li class="settingsErr">Error: {syncState.lastError}</li>
			{/if}
		</ul>
	{/if}
	<button type="button" class="btn secondary" onclick={syncNow} disabled={busy}>
		{busy ? 'Sincronizando…' : 'Sincronizar URLhaus ahora'}
	</button>
	{#if okMsg}
		<p class="muted" role="status">{okMsg}</p>
	{/if}
	{#if err}
		<p class="settingsErr" role="alert">{err}</p>
	{/if}
</div>
