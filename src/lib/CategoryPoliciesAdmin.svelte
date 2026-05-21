<script lang="ts">
	import { apiFetch } from '$lib/api-client';
	import { apiErrorMessage } from '$lib/api-errors';

	type CategoryId = 'social' | 'streaming' | 'gaming' | 'gambling' | 'malware';

	type CategoryDef = { id: CategoryId; label: string; domains?: string[] };

	type Policy = {
		id: string;
		ip: string;
		category_id: CategoryId;
		label: string | null;
		enabled: boolean;
		start: string;
		end: string;
		days: number[];
	};

	let {
		categories = [],
		policies = [],
		onChange
	}: {
		categories?: CategoryDef[];
		policies?: Policy[];
		onChange?: () => void | Promise<void>;
	} = $props();

	let err = $state<string | null>(null);
	let busy = $state(false);

	let formIp = $state('');
	let formLabel = $state('');
	let formCat = $state<CategoryId>('social');
	let formStart = $state('09:00');
	let formEnd = $state('14:00');
	let formEnabled = $state(true);
	let formDays = $state<number[]>([1, 2, 3, 4, 5]);

	const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

	const catLabels: Record<CategoryId, string> = {
		social: 'Redes sociales',
		streaming: 'Streaming',
		gaming: 'Juegos',
		gambling: 'Apuestas',
		malware: 'Malware/C2'
	};

	function toggleDay(d: number) {
		formDays = formDays.includes(d) ? formDays.filter((x) => x !== d) : [...formDays, d].sort();
	}

	async function savePolicy() {
		if (busy || !formIp.trim()) return;
		busy = true;
		err = null;
		const res = await apiFetch('/api/admin/categories', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'policy',
				policy: {
					id: crypto.randomUUID(),
					ip: formIp.trim(),
					category_id: formCat,
					label: formLabel.trim() || null,
					enabled: formEnabled,
					start: formStart,
					end: formEnd,
					days: formDays
				}
			})
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo guardar la política.');
			return;
		}
		formIp = '';
		formLabel = '';
		await onChange?.();
	}

	async function removePolicy(id: string) {
		if (busy || !confirm('¿Eliminar esta política de categoría?')) return;
		busy = true;
		err = null;
		const res = await apiFetch(`/api/admin/categories?policy_id=${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo eliminar.');
			return;
		}
		await onChange?.();
	}
</script>

<div class="catPol">
	<h3 class="catPol__h3">Horarios por categoría (por IP)</h3>
	<p class="muted catPol__hint">
		En las franjas activas se aplica el grupo Pi-hole <code class="mono">panel-cat-*</code> (bloqueo DNS de los
		dominios de esa categoría). Rellena dominios en cada categoría arriba.
	</p>

	<form
		class="catPol__form"
		onsubmit={(e) => {
			e.preventDefault();
			savePolicy();
		}}
	>
		<div class="catPol__grid">
			<label class="catPol__field">
				<span class="muted">IP del dispositivo</span>
				<input class="input mono" bind:value={formIp} required placeholder="192.0.2.10" />
			</label>
			<label class="catPol__field">
				<span class="muted">Etiqueta (opcional)</span>
				<input class="input" bind:value={formLabel} placeholder="Portátil Juan" />
			</label>
			<label class="catPol__field">
				<span class="muted">Categoría</span>
				<select class="input" bind:value={formCat}>
					{#each categories as c (c.id)}
						<option value={c.id}>{c.label}</option>
					{/each}
				</select>
			</label>
			<label class="catPol__field">
				<span class="muted">Desde</span>
				<input class="input mono" type="time" bind:value={formStart} required />
			</label>
			<label class="catPol__field">
				<span class="muted">Hasta</span>
				<input class="input mono" type="time" bind:value={formEnd} required />
			</label>
		</div>
		<fieldset class="catPol__days">
			<legend class="muted">Días (vacío = todos)</legend>
			{#each DAY_LABELS as lab, i (i)}
				<label class="catPol__day">
					<input type="checkbox" checked={formDays.includes(i)} onchange={() => toggleDay(i)} />
					{lab}
				</label>
			{/each}
		</fieldset>
		<label class="catPol__check">
			<input type="checkbox" bind:checked={formEnabled} />
			Activa
		</label>
		<button type="submit" class="btn btnAccent" disabled={busy || !formIp.trim()}>
			{busy ? 'Guardando…' : 'Añadir política'}
		</button>
	</form>

	{#if err}
		<p class="settingsErr" role="alert">{err}</p>
	{/if}

	{#if policies.length === 0}
		<p class="muted">No hay políticas por horario. Solo se aplican dominios de categoría si las defines arriba.</p>
	{:else}
		<ul class="catPol__list">
			{#each policies as p (p.id)}
				<li class="catPol__item" class:catPol__item--off={!p.enabled}>
					<div>
						<strong>{p.label ?? p.ip}</strong>
						<span class="mono muted"> · {p.ip}</span>
						<div class="muted catPol__meta">
							{catLabels[p.category_id] ?? p.category_id} · {p.start}–{p.end}
							·
							{p.days.length ? p.days.map((d) => DAY_LABELS[d]).join(', ') : 'todos los días'}
							· {p.enabled ? 'Activa' : 'Pausada'}
						</div>
					</div>
					<button type="button" class="btn btnMini btnGhost" disabled={busy} onclick={() => removePolicy(p.id)}>
						Eliminar
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.catPol {
		margin-top: 16px;
		padding-top: 16px;
		border-top: 1px dashed var(--border-subtle);
	}
	.catPol__h3 {
		margin: 0 0 6px;
		font-size: 14px;
		font-weight: 650;
	}
	.catPol__hint {
		margin: 0 0 12px;
		font-size: 12px;
		line-height: 1.45;
	}
	.catPol__form {
		display: flex;
		flex-direction: column;
		gap: 10px;
		margin-bottom: 14px;
	}
	.catPol__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 10px;
	}
	.catPol__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}
	.catPol__days {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.catPol__days legend {
		width: 100%;
		font-size: 12px;
	}
	.catPol__day {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
	}
	.catPol__check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.catPol__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.catPol__item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: 10px;
	}
	.catPol__item--off {
		opacity: 0.55;
	}
	.catPol__meta {
		font-size: 12px;
		margin-top: 2px;
	}
</style>
