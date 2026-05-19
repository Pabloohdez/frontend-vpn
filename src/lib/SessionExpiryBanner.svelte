<script lang="ts">
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	const WARN_MS = 15 * 60 * 1000;

	let show = $state(false);
	let minsLeft = $state(0);

	async function tick() {
		if (!browser) return;
		try {
			const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
			if (!res.ok) {
				show = false;
				return;
			}
			const j = (await res.json()) as { role?: string | null; sessionExpiresAt?: number };
			const exp = j.sessionExpiresAt;
			if (!exp || !j.role) {
				show = false;
				return;
			}
			const ms = exp - Date.now();
			minsLeft = Math.max(0, Math.ceil(ms / 60000));
			show = ms > 0 && ms < WARN_MS;
		} catch {
			show = false;
		}
	}

	onMount(() => {
		tick();
		const id = setInterval(tick, 60_000);
		return () => clearInterval(id);
	});
</script>

{#if show}
	<div class="sessionBannerGlobal" role="status">
		Tu sesión caduca en unos <strong>{minsLeft}</strong> min. Si vas a hacer cambios largos, guarda el trabajo o vuelve a
		entrar después.
	</div>
{/if}
