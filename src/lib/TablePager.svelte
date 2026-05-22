<script lang="ts">
	let {
		page = $bindable(1),
		total,
		pageSize,
		onPageChange
	}: {
		page?: number;
		total: number;
		pageSize: number;
		onPageChange?: (p: number) => void;
	} = $props();

	const pages = $derived(Math.max(1, Math.ceil(total / pageSize)));
	const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1);
	const to = $derived(Math.min(total, page * pageSize));

	function go(p: number) {
		const next = Math.min(Math.max(1, p), pages);
		page = next;
		onPageChange?.(next);
	}
</script>

{#if total > pageSize}
	<nav class="tablePager" aria-label="Paginación">
		<span class="tablePager__info">
			{from}–{to} de {total.toLocaleString('es-ES')}
		</span>
		<div class="tablePager__btns">
			<button type="button" class="btn secondary btnMini" disabled={page <= 1} onclick={() => go(1)}>
				«
			</button>
			<button type="button" class="btn secondary btnMini" disabled={page <= 1} onclick={() => go(page - 1)}>
				‹
			</button>
			<span class="tablePager__page muted">{page} / {pages}</span>
			<button
				type="button"
				class="btn secondary btnMini"
				disabled={page >= pages}
				onclick={() => go(page + 1)}
			>
				›
			</button>
			<button type="button" class="btn secondary btnMini" disabled={page >= pages} onclick={() => go(pages)}>
				»
			</button>
		</div>
	</nav>
{/if}
