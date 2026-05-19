<script lang="ts">
	import type { PiholeLists } from '$lib/pihole-lists';
	import { isApplied as isAppliedShared } from '$lib/pihole-lists';

	type Busy = {
		block?: boolean;
		allow?: boolean;
		unblock?: boolean;
		unallow?: boolean;
		blockWild?: boolean;
		allowWild?: boolean;
		unblockWild?: boolean;
		unallowWild?: boolean;
	};

	let {
		domain = '',
		isAdmin = false,
		lists = null,
		busy = {},
		deviceIp = '',
		ipChoices = [],
		tableDeviceIp = '',
		tableVpnLan = '',
		piholeClient = '',
		unknownDevice = false,
		deviceLabel = null,
		deviceCn = null,
		internetBlocked = false,
		activeBlockedIp = null,
		onInternetChange,
		onPointerDown,
		onAllow,
		onBlock,
		onAllowWild,
		onBlockWild,
		onUnallow,
		onUnblock,
		onUnallowWild,
		onUnblockWild
	}: {
		domain?: string;
		isAdmin?: boolean;
		lists?: PiholeLists | null;
		busy?: Busy;
		deviceIp?: string;
		ipChoices?: string[];
		/** Valores de las columnas DNS (para mostrar al usuario). */
		tableDeviceIp?: string;
		tableVpnLan?: string;
		piholeClient?: string;
		unknownDevice?: boolean;
		deviceLabel?: string | null;
		deviceCn?: string | null;
		internetBlocked?: boolean;
		activeBlockedIp?: string | null;
		onInternetChange?: () => void;
		onPointerDown?: (e: MouseEvent) => void;
		onAllow: () => void;
		onBlock: () => void;
		onAllowWild: () => void;
		onBlockWild: () => void;
		onUnallow: () => void;
		onUnblock: () => void;
		onUnallowWild: () => void;
		onUnblockWild: () => void;
	} = $props();

	let open = $state(false);
	let tab = $state<'internet' | 'domain'>('domain');
	let netBusy = $state(false);
	let localBlocked = $state(false);
	let selectedIp = $state('');
	let manualIp = $state('');

	$effect(() => {
		localBlocked = internetBlocked;
	});

	const hasDomain = $derived(Boolean(domain?.trim()));
	const hasClient = $derived(Boolean(piholeClient?.trim()));
	const showInternetTab = $derived(isAdmin && hasClient);
	const showDomainTab = $derived(hasDomain);
	const showTabs = $derived(showInternetTab && showDomainTab);
	const choices = $derived.by(() => {
		const out: string[] = [];
		const add = (ip: string) => {
			const t = ip.trim();
			if (isIpv4(t) && !out.includes(t)) out.push(t);
		};
		if (deviceIp && deviceIp !== '—') add(deviceIp);
		for (const ip of ipChoices ?? []) add(ip);
		if (tableDeviceIp && tableDeviceIp !== '—') add(tableDeviceIp);
		if (tableVpnLan && tableVpnLan !== '—') add(tableVpnLan);
		return out;
	});

	const effectiveIp = $derived.by(() => {
		if (localBlocked && activeBlockedIp) return activeBlockedIp;
		if (selectedIp && isIpv4(selectedIp)) return selectedIp;
		const manual = manualIp.trim();
		if (isIpv4(manual)) return manual;
		if (deviceIp && deviceIp !== '—' && isIpv4(deviceIp)) return deviceIp;
		return choices[0] ?? '';
	});

	const canBlock = $derived(isIpv4(effectiveIp));
	const anyBusy = $derived(Object.values(busy).some(Boolean) || netBusy);
	const canOpen = $derived(isAdmin && (hasDomain || hasClient));

	function isIpv4(ip: string) {
		return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip.trim());
	}

	function applied(list: 'black' | 'white', mode: 'exact' | 'wildcard') {
		return isAppliedShared(lists, domain, list, mode);
	}

	function stop(e: MouseEvent) {
		onPointerDown?.(e);
		e.stopPropagation();
	}

	function openModal(e: MouseEvent) {
		stop(e);
		selectedIp = choices[0] ?? '';
		manualIp =
			selectedIp ||
			(tableDeviceIp && tableDeviceIp !== '—' ? tableDeviceIp : '') ||
			(tableVpnLan && tableVpnLan !== '—' ? tableVpnLan : '');
		tab = showInternetTab ? 'internet' : 'domain';
		open = true;
	}

	function closeModal() {
		open = false;
	}

	function runAction(e: MouseEvent, fn: () => void) {
		stop(e);
		fn();
	}

	async function toggleInternet(e: MouseEvent) {
		stop(e);
		if (netBusy) return;
		if (!localBlocked && !canBlock && !piholeClient?.trim()) return;
		const ip = effectiveIp;
		const op = localBlocked ? 'unblock' : 'block';
		const who = deviceLabel || piholeClient || ip;
		const ok = confirm(
			op === 'block'
				? `¿Bloquear internet (DNS) para ${who} (${ip})? No resolverá dominios vía Pi-hole.`
				: `¿Restaurar internet (DNS) para ${who} (${ip})?`
		);
		if (!ok) return;
		netBusy = true;
		const res = await fetch('/api/admin/internet-block', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				ip: op === 'unblock' ? ip : ip || undefined,
				client: piholeClient || undefined,
				op,
				label: deviceLabel ?? who,
				cn: deviceCn
			})
		});
		const j = await res.json().catch(() => ({}));
		if (res.ok && j.ok) {
			localBlocked = op === 'block';
			onInternetChange?.();
		} else {
			alert(j.message ?? `Error ${res.status}`);
		}
		netBusy = false;
	}
</script>

{#if canOpen}
	<button
		type="button"
		class="btn btnSecondary btnMini dnsActionsTrigger"
		disabled={anyBusy}
		title="Listas Pi-hole y cortar internet de este cliente"
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={openModal}
	>
		{anyBusy ? '…' : 'Acciones'}
	</button>
{:else}
	<span class="muted">—</span>
{/if}

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="dnsActBackdrop"
		role="presentation"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="panel dnsActModal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="dns-act-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<header class="dnsActModal__head">
				<div class="dnsActModal__intro">
					<h2 id="dns-act-title">Acciones DNS</h2>
					<div class="dnsActModal__chips">
						{#if hasDomain}
							<span class="dnsActChip mono" title="Dominio">{domain}</span>
						{/if}
						{#if hasClient}
							<span class="dnsActChip" title="Cliente Pi-hole">
								{#if deviceLabel && deviceLabel !== '—'}
									{deviceLabel}
								{:else}
									<span class="mono">{piholeClient}</span>
								{/if}
								{#if deviceCn}
									<span class="dnsActChip__cn">· CN {deviceCn}</span>
								{/if}
							</span>
						{/if}
					</div>
				</div>
				<button type="button" class="dnsActClose" aria-label="Cerrar" onclick={closeModal}>×</button>
			</header>

			{#if showTabs}
				<div class="dnsActTabs" role="tablist" aria-label="Secciones">
					<button
						type="button"
						role="tab"
						class="dnsActTabs__btn"
						aria-selected={tab === 'internet'}
						onclick={() => (tab = 'internet')}
					>
						Internet
					</button>
					<button
						type="button"
						role="tab"
						class="dnsActTabs__btn"
						aria-selected={tab === 'domain'}
						onclick={() => (tab = 'domain')}
					>
						Dominio
					</button>
				</div>
			{/if}

			{#if showInternetTab && (!showTabs || tab === 'internet')}
				<section class="dnsActSection" aria-label="Cortar internet">
					{#if unknownDevice}
						<p class="dnsActAlert">
							<strong>No está en inventario.</strong> Pi-hole registró la IP en esta consulta; el panel la usa al bloquear.
						</p>
					{/if}
					<p class="dnsActSection__hint">
						Bloquea DNS en Pi-hole para este cliente (no apaga el Wi‑Fi).
					</p>

					{#if choices.length > 1}
						<label class="dnsActField">
							<span class="dnsActField__lab">IP a usar</span>
							<select class="input" bind:value={selectedIp}>
								{#each choices as ip (ip)}
									<option value={ip}>{ip}</option>
								{/each}
							</select>
						</label>
					{:else if choices.length === 1}
						<p class="dnsActIp mono">{choices[0]}</p>
					{:else}
						<div class="dnsActRowIps">
							<p class="dnsActSection__hint dnsActRowIps__lead">
								Cliente: <span class="mono">{piholeClient}</span>
							</p>
							<p class="dnsActSection__hint">
								Sin IP visible: se buscará en consultas recientes al cortar. IP manual solo si falla.
							</p>
						</div>
						<label class="dnsActField">
							<span class="dnsActField__lab">IP manual (opcional)</span>
							<input
								class="input mono"
								type="text"
								inputmode="decimal"
								placeholder="ej. 192.168.1.87"
								bind:value={manualIp}
							/>
						</label>
					{/if}

					{#if activeBlockedIp && activeBlockedIp !== effectiveIp}
						<p class="dnsActSection__hint">
							Bloqueo activo en <span class="mono">{activeBlockedIp}</span>.
						</p>
					{/if}

					<button
						type="button"
						class="btn dnsActPrimary {localBlocked ? 'btnRestoreNet' : 'btnCutNet'}"
						disabled={netBusy || anyBusy || (!localBlocked && !canBlock && !piholeClient?.trim())}
						onclick={toggleInternet}
					>
						{netBusy ? '…' : localBlocked ? 'Restaurar internet' : 'Cortar internet'}
					</button>
					<a class="dnsActLink muted" href="/pihole/bloqueos">Ver dispositivos en red →</a>
				</section>
			{/if}

			{#if showDomainTab && (!showTabs || tab === 'domain')}
				<section class="dnsActSection" aria-label="Listas Pi-hole">
					<p class="dnsActSection__hint">Permitir o bloquear en listas blancas/negras de Pi-hole.</p>
					<div class="dnsActGrid">
						<button
							type="button"
							class="btn btnSecondary dnsActGrid__btn"
							disabled={anyBusy}
							onclick={(e) => runAction(e, onAllow)}
						>
							{busy.allow ? '…' : applied('white', 'exact') ? 'Permitir ✓' : 'Permitir dominio'}
						</button>
						<button
							type="button"
							class="btn btnSecondary dnsActGrid__btn"
							disabled={anyBusy}
							onclick={(e) => runAction(e, onBlock)}
						>
							{busy.block ? '…' : applied('black', 'exact') ? 'Bloquear ✓' : 'Bloquear dominio'}
						</button>
						<button
							type="button"
							class="btn btnSecondary dnsActGrid__btn"
							disabled={anyBusy}
							onclick={(e) => runAction(e, onAllowWild)}
						>
							{busy.allowWild ? '…' : applied('white', 'wildcard') ? 'Permitir * ✓' : 'Permitir *.dominio'}
						</button>
						<button
							type="button"
							class="btn btnSecondary dnsActGrid__btn"
							disabled={anyBusy}
							onclick={(e) => runAction(e, onBlockWild)}
						>
							{busy.blockWild ? '…' : applied('black', 'wildcard') ? 'Bloquear * ✓' : 'Bloquear *.dominio'}
						</button>
					</div>
					<details class="dnsActMore">
						<summary>Quitar de listas</summary>
						<div class="dnsActGrid dnsActGrid--secondary">
							<button
								type="button"
								class="btn btnSecondary btnMini"
								disabled={anyBusy || !applied('white', 'exact')}
								onclick={(e) => runAction(e, onUnallow)}
							>
								{busy.unallow ? '…' : 'Quitar permitido'}
							</button>
							<button
								type="button"
								class="btn btnSecondary btnMini"
								disabled={anyBusy || !applied('black', 'exact')}
								onclick={(e) => runAction(e, onUnblock)}
							>
								{busy.unblock ? '…' : 'Quitar bloqueado'}
							</button>
							<button
								type="button"
								class="btn btnSecondary btnMini"
								disabled={anyBusy || !applied('white', 'wildcard')}
								onclick={(e) => runAction(e, onUnallowWild)}
							>
								{busy.unallowWild ? '…' : 'Quitar permiso *'}
							</button>
							<button
								type="button"
								class="btn btnSecondary btnMini"
								disabled={anyBusy || !applied('black', 'wildcard')}
								onclick={(e) => runAction(e, onUnblockWild)}
							>
								{busy.unblockWild ? '…' : 'Quitar bloqueo *'}
							</button>
						</div>
					</details>
				</section>
			{/if}
		</div>
	</div>
{/if}

<style>
	.dnsActionsTrigger {
		min-width: 5.5rem;
	}

	.dnsActBackdrop {
		position: fixed;
		inset: 0;
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px 14px;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(3px);
	}

	.dnsActModal {
		width: min(480px, 100%);
		max-height: min(85vh, 640px);
		overflow: auto;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 16px 18px 18px;
	}

	.dnsActModal__head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 10px;
	}

	.dnsActModal__intro {
		min-width: 0;
		flex: 1;
	}

	.dnsActModal__head h2 {
		margin: 0 0 8px;
		font-size: 1.05rem;
		font-weight: 650;
	}

	.dnsActModal__chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.dnsActChip {
		display: inline-block;
		max-width: 100%;
		padding: 4px 8px;
		border-radius: 6px;
		font-size: 11px;
		line-height: 1.35;
		word-break: break-word;
		border: 1px solid var(--border-subtle);
		background: color-mix(in srgb, var(--border-subtle) 35%, var(--bg-card));
		color: var(--color-muted);
	}

	.dnsActChip.mono {
		font-family: var(--font-mono);
		color: var(--color-text);
	}

	.dnsActChip__cn {
		opacity: 0.85;
	}

	.dnsActClose {
		flex-shrink: 0;
		width: 2rem;
		height: 2rem;
		padding: 0;
		border: 1px solid var(--border-default);
		border-radius: 8px;
		background: var(--bg-body);
		color: var(--color-muted);
		font-size: 1.25rem;
		line-height: 1;
		cursor: pointer;
	}

	.dnsActClose:hover {
		color: var(--color-text);
		border-color: var(--border-default);
	}

	.dnsActTabs {
		display: flex;
		gap: 4px;
		padding: 3px;
		border-radius: 10px;
		background: color-mix(in srgb, var(--border-subtle) 40%, var(--bg-body));
		border: 1px solid var(--border-subtle);
	}

	.dnsActTabs__btn {
		flex: 1;
		padding: 8px 12px;
		border: none;
		border-radius: 7px;
		background: transparent;
		font-size: 13px;
		font-weight: 600;
		color: var(--color-muted);
		cursor: pointer;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}

	.dnsActTabs__btn[aria-selected='true'] {
		background: var(--bg-card);
		color: var(--color-text);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
	}

	.dnsActSection {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.dnsActPrimary {
		width: 100%;
		margin-top: 2px;
	}

	.dnsActSection__hint {
		margin: 0;
		font-size: 12px;
		line-height: 1.45;
		color: var(--color-muted);
	}

	.dnsActAlert {
		margin: 0;
		padding: 8px 10px;
		border-radius: 8px;
		font-size: 11px;
		line-height: 1.4;
		border: 1px solid color-mix(in srgb, #f59e0b 40%, var(--border-default));
		background: color-mix(in srgb, #f59e0b 12%, var(--bg-card));
	}

	.dnsActMore {
		margin-top: 2px;
		border: 1px solid var(--border-subtle);
		border-radius: 10px;
		overflow: hidden;
	}

	.dnsActMore summary {
		padding: 8px 12px;
		font-size: 12px;
		font-weight: 600;
		color: var(--color-muted);
		cursor: pointer;
		list-style: none;
		background: color-mix(in srgb, var(--border-subtle) 30%, var(--bg-card));
	}

	.dnsActMore summary::-webkit-details-marker {
		display: none;
	}

	.dnsActMore[open] summary {
		border-bottom: 1px solid var(--border-subtle);
		color: var(--color-text);
	}

	.dnsActMore .dnsActGrid {
		padding: 10px;
	}

	.dnsActRowIps__lead {
		margin: 0 !important;
	}

	.dnsActField {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.dnsActField__lab {
		font-size: 12px;
		color: var(--color-muted);
	}

	.dnsActIp {
		margin: 0;
		font-size: 14px;
		font-weight: 600;
	}

	.dnsActLink {
		font-size: 12px;
		text-decoration: none;
	}

	.dnsActLink:hover {
		text-decoration: underline;
	}

	.dnsActRowIps {
		padding: 10px 12px;
		border-radius: 10px;
		border: 1px solid var(--border-subtle);
		background: color-mix(in srgb, var(--border-subtle) 25%, var(--bg-card));
	}

	.dnsActGrid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 6px;
	}

	.dnsActGrid__btn {
		font-size: 12px;
		padding: 8px 10px;
		white-space: normal;
		line-height: 1.25;
		min-height: 2.5rem;
	}

	@media (max-width: 420px) {
		.dnsActGrid {
			grid-template-columns: 1fr;
		}
	}

	.btnCutNet {
		color: #fff;
		background: #dc2626;
		border: 1px solid #f87171;
		font-weight: 600;
	}

	.btnCutNet:hover:not(:disabled) {
		background: #ef4444;
		color: #fff;
	}

	.btnRestoreNet {
		color: var(--color-text);
		background: color-mix(in srgb, var(--border-subtle) 35%, var(--bg-card));
		border: 1px solid var(--border-default);
		font-weight: 600;
	}
</style>
