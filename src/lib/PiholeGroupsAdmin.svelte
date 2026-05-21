<script lang="ts">
	import { onMount } from 'svelte';
	import { apiFetch } from '$lib/api-client';
	import { apiErrorMessage, describeFetchResponse } from '$lib/api-errors';

	type PiholeGroup = { id: number; name: string };
	type TargetType = 'ip' | 'vpn_cn';
	type Policy = {
		id: string;
		target_type: TargetType;
		ip: string;
		vpn_cn: string | null;
		group_ids: number[];
		label: string | null;
		enabled: boolean;
		start: string;
		end: string;
		days: number[];
	};

	let groups = $state<PiholeGroup[]>([]);
	let policies = $state<Policy[]>([]);
	let vpnCns = $state<string[]>([]);
	let piholeOk = $state(true);
	let busy = $state(false);
	let err = $state<string | null>(null);
	let okMsg = $state<string | null>(null);

	let newGroupName = $state('');
	let newGroupDesc = $state('Grupo personalizado — panel VPN');

	let formTarget = $state<TargetType>('ip');
	let formIp = $state('');
	let formCn = $state('');
	let formLabel = $state('');
	let formStart = $state('09:00');
	let formEnd = $state('17:00');
	let formEnabled = $state(true);
	let formDays = $state<number[]>([1, 2, 3, 4, 5]);
	let selectedGroupIds = $state<number[]>([]);

	const DAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

	function toggleDay(d: number) {
		formDays = formDays.includes(d) ? formDays.filter((x) => x !== d) : [...formDays, d].sort();
	}

	function toggleGroupId(id: number) {
		selectedGroupIds = selectedGroupIds.includes(id)
			? selectedGroupIds.filter((x) => x !== id)
			: [...selectedGroupIds, id].sort((a, b) => a - b);
	}

	function groupNamesForPolicy(p: Policy): string {
		return p.group_ids
			.map((id) => groups.find((g) => g.id === id)?.name ?? `#${id}`)
			.join(', ');
	}

	function policyTargetLabel(p: Policy): string {
		if (p.target_type === 'vpn_cn' && p.vpn_cn) return `CN ${p.vpn_cn}`;
		return p.ip || '—';
	}

	async function load() {
		err = null;
		const res = await fetch('/api/admin/pihole-groups', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			const fail = await describeFetchResponse(res, 'No se pudieron cargar los grupos.');
			err = fail.message;
			return;
		}
		const j = await res.json();
		groups = j.groups ?? [];
		policies = j.policies ?? [];
		vpnCns = j.vpn_cns ?? [];
		piholeOk = Boolean(j.pihole_ok);
	}

	async function createGroup() {
		if (busy || !newGroupName.trim()) return;
		busy = true;
		err = null;
		okMsg = null;
		const res = await apiFetch('/api/admin/pihole-groups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'create_group',
				name: newGroupName.trim(),
				description: newGroupDesc.trim()
			})
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo crear el grupo.');
			return;
		}
		okMsg = `Grupo «${j.group?.name ?? newGroupName}» creado (id ${j.group?.id ?? '?'}).`;
		newGroupName = '';
		await load();
	}

	async function savePolicy() {
		if (busy || !selectedGroupIds.length) return;
		if (formTarget === 'ip' && !formIp.trim()) return;
		if (formTarget === 'vpn_cn' && !formCn.trim()) return;
		busy = true;
		err = null;
		okMsg = null;
		const res = await apiFetch('/api/admin/pihole-groups', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				type: 'policy',
				policy: {
					id: crypto.randomUUID(),
					target_type: formTarget,
					ip: formTarget === 'ip' ? formIp.trim() : '',
					vpn_cn: formTarget === 'vpn_cn' ? formCn.trim() : null,
					group_ids: selectedGroupIds,
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
		okMsg = 'Política de grupos guardada.';
		formIp = '';
		formCn = '';
		formLabel = '';
		selectedGroupIds = [];
		await load();
	}

	async function removePolicy(id: string) {
		if (busy || !confirm('¿Eliminar esta política de grupos?')) return;
		busy = true;
		const res = await apiFetch(`/api/admin/pihole-groups?policy_id=${encodeURIComponent(id)}`, {
			method: 'DELETE'
		});
		busy = false;
		if (!res.ok) {
			const j = await res.json().catch(() => null);
			err = apiErrorMessage(res.status, j, 'No se pudo eliminar.');
			return;
		}
		await load();
	}

	onMount(load);
</script>

<div class="piholeGroups">
	<h3 class="panel__h3">Grupos Pi-hole personalizados</h3>
	<p class="muted settingsNote">
		Crea grupos en Pi-hole v6 y asígnalos por horario a una <strong>IP</strong> o <strong>CN VPN</strong>.
		Complementa los grupos automáticos <code class="mono">panel-cat-*</code> de las categorías.
		{#if !piholeOk}
			<span class="settingsErr"> No se pudo contactar con Pi-hole (revisa token y URL).</span>
		{/if}
	</p>

	<section class="piholeGroups__section">
		<h4 class="piholeGroups__h4">Crear grupo en Pi-hole</h4>
		<div class="piholeGroups__row">
			<input class="input mono" placeholder="nombre-grupo" bind:value={newGroupName} />
			<input class="input" placeholder="Descripción" bind:value={newGroupDesc} />
			<button type="button" class="btn secondary" disabled={busy || !newGroupName.trim()} onclick={createGroup}>
				Crear grupo
			</button>
		</div>
	</section>

	{#if groups.length > 0}
		<p class="muted" style="font-size:12px;margin:8px 0">
			Grupos en Pi-hole: {groups.map((g) => `${g.name} (#${g.id})`).join(' · ')}
		</p>
	{/if}

	<section class="piholeGroups__section">
		<h4 class="piholeGroups__h4">Asignar grupos por horario</h4>
		<fieldset class="piholeGroups__target">
			<legend class="muted">Aplicar a</legend>
			<label><input type="radio" bind:group={formTarget} value="ip" /> IP</label>
			<label><input type="radio" bind:group={formTarget} value="vpn_cn" /> CN VPN</label>
		</fieldset>
		{#if formTarget === 'ip'}
			<input class="input mono" placeholder="192.0.2.10" bind:value={formIp} />
		{:else}
			<input class="input mono" list="pg-cn-list" placeholder="alumno1" bind:value={formCn} />
			<datalist id="pg-cn-list">
				{#each vpnCns as cn (cn)}
					<option value={cn}></option>
				{/each}
			</datalist>
		{/if}
		<input class="input" placeholder="Etiqueta opcional" bind:value={formLabel} />
		<div class="piholeGroups__row">
			<input class="input mono" type="time" bind:value={formStart} />
			<span class="muted">–</span>
			<input class="input mono" type="time" bind:value={formEnd} />
		</div>
		<fieldset class="piholeGroups__days">
			<legend class="muted">Días</legend>
			{#each DAY_LABELS as lab, i (i)}
				<label class="piholeGroups__day">
					<input type="checkbox" checked={formDays.includes(i)} onchange={() => toggleDay(i)} />
					{lab}
				</label>
			{/each}
		</fieldset>
		<p class="muted" style="font-size:12px">Grupos a aplicar en la franja:</p>
		<div class="piholeGroups__checks">
			{#each groups as g (g.id)}
				<label class="piholeGroups__checkItem">
					<input
						type="checkbox"
						checked={selectedGroupIds.includes(g.id)}
						onchange={() => toggleGroupId(g.id)}
					/>
					<span class="mono">{g.name}</span>
					<span class="muted">#{g.id}</span>
				</label>
			{:else}
				<p class="muted">Crea al menos un grupo arriba o sincroniza con Pi-hole.</p>
			{/each}
		</div>
		<label><input type="checkbox" bind:checked={formEnabled} /> Activa</label>
		<button
			type="button"
			class="btn btnAccent"
			disabled={busy || !selectedGroupIds.length || (formTarget === 'ip' ? !formIp.trim() : !formCn.trim())}
			onclick={savePolicy}
		>
			{busy ? 'Guardando…' : 'Guardar política de grupos'}
		</button>
	</section>

	{#if policies.length > 0}
		<ul class="piholeGroups__list">
			{#each policies as p (p.id)}
				<li class="piholeGroups__item" class:piholeGroups__item--off={!p.enabled}>
					<div>
						<strong>{p.label ?? policyTargetLabel(p)}</strong>
						<span class="mono muted"> · {policyTargetLabel(p)}</span>
						<div class="muted" style="font-size:12px;margin-top:4px">
							Grupos: {groupNamesForPolicy(p)} · {p.start}–{p.end}
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

	{#if okMsg}<p class="muted" role="status">{okMsg}</p>{/if}
	{#if err}<p class="settingsErr" role="alert">{err}</p>{/if}
</div>

<style>
	.piholeGroups {
		margin-top: 1.25rem;
		padding-top: 1rem;
		border-top: 1px dashed var(--border-subtle);
	}
	.piholeGroups__h4 {
		margin: 0 0 8px;
		font-size: 13px;
		font-weight: 650;
	}
	.piholeGroups__section {
		margin-bottom: 14px;
	}
	.piholeGroups__row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		align-items: center;
		margin-top: 8px;
	}
	.piholeGroups__target {
		border: none;
		padding: 0;
		margin: 8px 0;
		display: flex;
		gap: 12px;
		font-size: 13px;
	}
	.piholeGroups__target legend {
		width: 100%;
		font-size: 12px;
	}
	.piholeGroups__days {
		border: none;
		padding: 0;
		margin: 8px 0;
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.piholeGroups__day {
		font-size: 12px;
		display: inline-flex;
		gap: 4px;
		align-items: center;
	}
	.piholeGroups__checks {
		display: flex;
		flex-direction: column;
		gap: 6px;
		margin: 8px 0;
		max-height: 160px;
		overflow-y: auto;
		padding: 8px;
		border: 1px solid var(--border-subtle);
		border-radius: 8px;
	}
	.piholeGroups__checkItem {
		display: flex;
		gap: 8px;
		align-items: center;
		font-size: 12px;
	}
	.piholeGroups__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.piholeGroups__item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border: 1px solid var(--border-subtle);
		border-radius: 10px;
	}
	.piholeGroups__item--off {
		opacity: 0.55;
	}
</style>
