<script lang="ts">
	import { onMount } from 'svelte';

	let auditor = $state(false);
	let loaded = $state(false);

	onMount(async () => {
		try {
			const r = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
			if (!r.ok) return;
			const j = (await r.json()) as { role?: string | null };
			auditor = j.role === 'auditor';
		} finally {
			loaded = true;
		}
	});
</script>

{#if loaded && auditor}
	<div class="auditorBanner" role="status">
		<strong>Modo auditor</strong>: solo lectura. No puedes cambiar listas Pi-hole, DNS rápido ni gestión de usuarios.
	</div>
{/if}

<style>
	.auditorBanner {
		margin: 0 auto;
		max-width: 1120px;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		color: var(--session-banner-fg);
		background: var(--session-banner-bg);
		border-bottom: 1px solid var(--session-banner-border);
	}
	.auditorBanner strong {
		font-weight: 650;
	}
</style>
