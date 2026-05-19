<script lang="ts" generics="T extends Record<string, unknown>">
	import { onMount } from 'svelte';
	import { toast } from './toast';
	import {
		deleteSavedFilter,
		listSavedFilters,
		saveFilter,
		type SavedFilter
	} from './saved-filters';

	type Props = {
		section: string;
		current: T;
		apply: (data: T) => void;
		labelPrefix?: string;
	};

	let { section, current, apply, labelPrefix = 'Filtros' }: Props = $props();

	let items = $state<SavedFilter<T>[]>([]);
	let saving = $state(false);
	let nameDraft = $state('');

	function refresh() {
		items = listSavedFilters<T>(section);
	}

	onMount(refresh);

	function onSave() {
		const name = nameDraft.trim();
		if (!name) {
			toast.warn('Pon un nombre al filtro');
			return;
		}
		try {
			saving = true;
			saveFilter<T>(section, name, current);
			refresh();
			nameDraft = '';
			saving = false;
			toast.success(`Filtro «${name}» guardado`);
		} catch (e) {
			saving = false;
			toast.error(`No se pudo guardar: ${String((e as Error).message ?? e)}`);
		}
	}

	function onApply(item: SavedFilter<T>) {
		apply(item.data);
		toast.info(`Filtro «${item.name}» aplicado`);
	}

	function onDelete(item: SavedFilter<T>) {
		const ok = confirm(`¿Borrar el filtro «${item.name}»?`);
		if (!ok) return;
		deleteSavedFilter(section, item.id);
		refresh();
		toast.success(`Filtro «${item.name}» borrado`);
	}
</script>

<div class="savedFilters" aria-label="{labelPrefix} guardados">
	<div class="savedFilters__head">
		<strong class="savedFilters__title">{labelPrefix} guardados</strong>
		<form
			class="savedFilters__add"
			onsubmit={(e) => {
				e.preventDefault();
				onSave();
			}}
		>
			<input
				class="input savedFilters__name"
				type="text"
				placeholder="Nombre…"
				bind:value={nameDraft}
				maxlength="40"
				aria-label="Nombre del filtro a guardar"
			/>
			<button
				type="submit"
				class="btn primary savedFilters__save"
				disabled={saving || !nameDraft.trim()}
			>
				Guardar
			</button>
		</form>
	</div>
	{#if items.length === 0}
		<p class="savedFilters__empty">Aún no has guardado filtros en esta vista.</p>
	{:else}
		<ul class="savedFilters__list">
			{#each items as f (f.id)}
				<li class="savedFilters__item">
					<button
						type="button"
						class="savedFilters__pill"
						onclick={() => onApply(f)}
						title="Aplicar «{f.name}»"
					>
						{f.name}
					</button>
					<button
						type="button"
						class="savedFilters__del"
						onclick={() => onDelete(f)}
						aria-label={`Borrar filtro ${f.name}`}
						title="Borrar"
					>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.savedFilters {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle, #e2e8f0);
		border-radius: 10px;
		background: var(--bg-card, #ffffff);
	}
	.savedFilters__head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}
	.savedFilters__title { font-size: 13px; color: var(--color-text, #0f172a); }
	.savedFilters__add {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.savedFilters__name {
		min-width: 160px;
		font-size: 12.5px;
		padding: 4px 8px;
	}
	.savedFilters__save {
		font-size: 12.5px;
		padding: 5px 10px;
	}
	.savedFilters__empty {
		margin: 0;
		font-size: 12.5px;
		color: var(--color-text-muted, #64748b);
	}
	.savedFilters__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.savedFilters__item {
		display: inline-flex;
		align-items: center;
		gap: 0;
		border: 1px solid var(--border-subtle, #e2e8f0);
		border-radius: 999px;
		overflow: hidden;
		background: var(--bg-subtle, #f8fafc);
	}
	.savedFilters__pill {
		appearance: none;
		background: transparent;
		border: 0;
		padding: 4px 10px;
		font-size: 12.5px;
		cursor: pointer;
		color: var(--color-text, #0f172a);
	}
	.savedFilters__pill:hover {
		background: color-mix(in srgb, var(--color-accent, #0d9488) 12%, transparent);
	}
	.savedFilters__del {
		appearance: none;
		background: transparent;
		border: 0;
		border-left: 1px solid var(--border-subtle, #e2e8f0);
		padding: 0 8px;
		font-size: 16px;
		line-height: 1;
		cursor: pointer;
		color: var(--color-text-muted, #64748b);
	}
	.savedFilters__del:hover {
		background: color-mix(in srgb, currentColor 8%, transparent);
		color: var(--color-text, #0f172a);
	}
</style>
