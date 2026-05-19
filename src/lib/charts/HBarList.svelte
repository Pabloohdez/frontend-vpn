<script lang="ts">
	type Row = { label: string; sublabel?: string; count: number };
	let {
		rows,
		max = 0,
		emptyText = 'Sin datos.'
	}: { rows: Row[]; max?: number; emptyText?: string } = $props();

	const computedMax = $derived(Math.max(1, max, ...rows.map((r) => r.count)));
</script>

{#if rows.length === 0}
	<p class="hbarEmpty muted">{emptyText}</p>
{:else}
	<ul class="hbarList">
		{#each rows as row, i (`${row.label}-${i}`)}
			<li class="hbarRow">
				<div class="hbarHead">
					<span class="hbarLabel" title={row.label}>{row.label}</span>
					<span class="hbarCount mono">{row.count.toLocaleString('es-ES')}</span>
				</div>
				{#if row.sublabel}
					<div class="hbarSub muted mono">{row.sublabel}</div>
				{/if}
				<div class="hbarTrack" aria-hidden="true">
					<div
						class="hbarFill"
						style={`width:${Math.round((100 * row.count) / computedMax)}%`}
					></div>
				</div>
			</li>
		{/each}
	</ul>
{/if}

<style>
	.hbarList {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 10px;
	}
	.hbarHead {
		display: flex;
		justify-content: space-between;
		gap: 8px;
		align-items: baseline;
	}
	.hbarLabel {
		font-weight: 600;
		max-width: 75%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.hbarCount {
		font-size: 12.5px;
	}
	.hbarSub {
		font-size: 11.5px;
		margin-top: -1px;
		opacity: 0.75;
	}
	.hbarTrack {
		margin-top: 4px;
		height: 6px;
		background: color-mix(in srgb, currentColor 8%, transparent);
		border-radius: 999px;
		overflow: hidden;
	}
	.hbarFill {
		height: 100%;
		background: linear-gradient(90deg, #0d9488, #14b8a6);
		border-radius: 999px;
	}
	.hbarEmpty {
		margin: 0;
		font-size: 13px;
	}
</style>
