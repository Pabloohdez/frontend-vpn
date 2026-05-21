<script lang="ts">
	import { apiFetch } from '$lib/api-client';
	import { apiErrorMessage } from '$lib/api-errors';
	import { toast } from '$lib/toast.svelte';

	type Props = {
		ip: string;
		label?: string | null;
		cn?: string | null;
		blocked?: boolean;
		disabled?: boolean;
		compact?: boolean;
		onchange?: () => void;
	};

	let {
		ip,
		label = null,
		cn = null,
		blocked = false,
		disabled = false,
		compact = false,
		onchange
	}: Props = $props();

	let busy = $state(false);
	let localBlocked = $state(false);

	$effect(() => {
		localBlocked = blocked;
	});

	async function toggle() {
		if (!ip || ip === '—' || busy || disabled) return;
		busy = true;
		const op = localBlocked ? 'unblock' : 'block';
		const ok = confirm(
			op === 'block'
				? `¿Bloquear internet (DNS) para ${ip}? El dispositivo no resolverá dominios vía Pi-hole.`
				: `¿Restaurar internet (DNS) para ${ip}?`
		);
		if (!ok) {
			busy = false;
			return;
		}
		const res = await apiFetch('/api/admin/internet-block', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ ip, op, label, cn })
		});
		const j = await res.json().catch(() => ({}));
		if (res.ok && j.ok) {
			localBlocked = op === 'block';
			onchange?.();
			toast.success(op === 'block' ? `Internet cortado (${ip})` : `Internet restaurado (${ip})`);
		} else {
			toast.error(apiErrorMessage(res.status, j, 'No se pudo cambiar el bloqueo de internet.'), {
				ttl: res.status === 429 ? 10_000 : 7000
			});
		}
		busy = false;
	}
</script>

{#if ip && ip !== '—'}
	<button
		type="button"
		class="btn btnMini {localBlocked ? 'btnWarn' : 'btnSecondary'} internetBlockBtn"
		class:internetBlockBtn--compact={compact}
		disabled={disabled || busy}
		title={localBlocked ? 'Restaurar acceso DNS' : 'Cortar internet vía Pi-hole (bloqueo DNS)'}
		aria-label={localBlocked ? `Restaurar internet para ${ip}` : `Bloquear internet para ${ip}`}
		onclick={toggle}
	>
		{busy ? '…' : localBlocked ? (compact ? 'Restaurar' : 'Restaurar internet') : compact ? 'Cortar' : 'Cortar internet'}
	</button>
{/if}

<style>
	.internetBlockBtn.btnWarn {
		border-color: color-mix(in srgb, #ef4444 45%, var(--border-default));
		background: color-mix(in srgb, #ef4444 12%, var(--bg-card));
		color: var(--color-text);
	}
	.internetBlockBtn--compact {
		font-size: 11px;
		padding: 5px 8px;
		max-width: 100%;
		white-space: nowrap;
	}
</style>
