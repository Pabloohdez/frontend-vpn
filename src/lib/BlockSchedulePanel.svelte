<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/locale.svelte';
	import { csrfHeaders } from '$lib/csrf-client';

	type Schedule = {
		id: string;
		ip: string;
		label: string | null;
		enabled: boolean;
		days: number[];
		start: string;
		end: string;
	};

	let {
		isAdmin = false,
		presetIp = '',
		presetLabel = ''
	}: { isAdmin?: boolean; presetIp?: string; presetLabel?: string } = $props();

	let schedules = $state<Schedule[]>([]);
	let loading = $state(true);
	let saving = $state(false);
	let showForm = $state(false);

	let formIp = $state('');
	let formLabel = $state('');
	let formStart = $state('22:00');
	let formEnd = $state('07:00');
	let formEnabled = $state(true);
	let formDays = $state<number[]>([1, 2, 3, 4, 5]);

	const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

	$effect(() => {
		if (presetIp) {
			formIp = presetIp;
			formLabel = presetLabel;
		}
	});

	function toggleDay(d: number) {
		formDays = formDays.includes(d) ? formDays.filter((x) => x !== d) : [...formDays, d].sort();
	}

	async function load() {
		loading = true;
		const res = await fetch('/api/admin/block-schedules', { headers: { 'cache-control': 'no-cache' } });
		if (res.ok) {
			const j = await res.json();
			schedules = j.schedules ?? [];
		}
		loading = false;
	}

	async function save() {
		if (!isAdmin || saving || !formIp.trim()) return;
		saving = true;
		const res = await fetch('/api/admin/block-schedules', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({
				ip: formIp.trim(),
				label: formLabel.trim() || null,
				start: formStart,
				end: formEnd,
				enabled: formEnabled,
				days: formDays
			})
		});
		const j = await res.json().catch(() => ({}));
		saving = false;
		if (!res.ok) {
			alert(j.message ?? `Error ${res.status}`);
			return;
		}
		showForm = false;
		await load();
	}

	async function remove(id: string) {
		if (!isAdmin || !confirm('¿Eliminar este horario?')) return;
		await fetch(`/api/admin/block-schedules?id=${encodeURIComponent(id)}`, {
			method: 'DELETE',
			headers: { ...csrfHeaders() }
		});
		await load();
	}

	onMount(load);
</script>

{#if isAdmin}
	<section class="panel blockSched" aria-label={t('schedules.title')}>
		<div class="blockSched__head">
			<h2 class="panel__h2">{t('schedules.title')}</h2>
			<button type="button" class="btn btnMini secondary" onclick={() => (showForm = !showForm)}>
				{showForm ? '✕' : t('schedules.add')}
			</button>
		</div>

		{#if showForm}
			<form class="blockSched__form" onsubmit={(e) => { e.preventDefault(); save(); }}>
				<label class="blockSched__field">
					<span>IP</span>
					<input class="input mono" bind:value={formIp} required />
				</label>
				<label class="blockSched__field">
					<span>Etiqueta</span>
					<input class="input" bind:value={formLabel} />
				</label>
				<div class="blockSched__row">
					<label class="blockSched__field">
						<span>{t('schedules.from')}</span>
						<input class="input mono" type="time" bind:value={formStart} required />
					</label>
					<label class="blockSched__field">
						<span>{t('schedules.to')}</span>
						<input class="input mono" type="time" bind:value={formEnd} required />
					</label>
				</div>
				<fieldset class="blockSched__days">
					<legend>{t('schedules.days')}</legend>
					{#each DAY_LABELS as lab, i (i)}
						<label class="blockSched__day">
							<input
								type="checkbox"
								checked={formDays.includes(i)}
								onchange={() => toggleDay(i)}
							/>
							{lab}
						</label>
					{/each}
				</fieldset>
				<label class="blockSched__check">
					<input type="checkbox" bind:checked={formEnabled} />
					{t('schedules.enabled')}
				</label>
				<button type="submit" class="btn btnAccent" disabled={saving}>
					{saving ? t('common.loading') : t('schedules.save')}
				</button>
			</form>
		{/if}

		{#if loading}
			<p class="muted">{t('common.loading')}</p>
		{:else if schedules.length === 0}
			<p class="muted">{t('schedules.empty')}</p>
		{:else}
			<ul class="blockSched__list">
				{#each schedules as s (s.id)}
					<li class="blockSched__item" class:blockSched__item--off={!s.enabled}>
						<div class="blockSched__itemHead">
							<strong>{s.label ?? s.ip}</strong>
							<span class="mono muted">{s.ip}</span>
						</div>
						<div class="blockSched__itemMeta muted">
							{s.start} – {s.end}
							·
							{s.days.length === 0
								? 'todos los días'
								: s.days.map((d) => DAY_LABELS[d]).join(', ')}
						</div>
						<button type="button" class="btn btnMini btnGhost" onclick={() => remove(s.id)}>
							{t('schedules.delete')}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.blockSched__head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
	}
	.blockSched__form {
		display: grid;
		gap: 10px;
		margin-bottom: 16px;
		padding: 12px;
		border-radius: 10px;
		border: 1px dashed var(--border-subtle, rgba(0, 0, 0, 0.12));
	}
	.blockSched__row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}
	.blockSched__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}
	.blockSched__days {
		border: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.blockSched__days legend {
		width: 100%;
		font-size: 12px;
		margin-bottom: 4px;
	}
	.blockSched__day {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		font-size: 12px;
	}
	.blockSched__check {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.blockSched__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: grid;
		gap: 8px;
	}
	.blockSched__item {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 4px 12px;
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--border-subtle);
		align-items: center;
	}
	.blockSched__item--off {
		opacity: 0.55;
	}
	.blockSched__itemHead {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: baseline;
	}
	.blockSched__itemMeta {
		grid-column: 1;
		font-size: 12px;
	}
	.blockSched__item button {
		grid-column: 2;
		grid-row: 1 / span 2;
	}
</style>
