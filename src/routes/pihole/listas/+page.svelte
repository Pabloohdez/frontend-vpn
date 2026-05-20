<script lang="ts">
	import { onMount } from 'svelte';
	import './page.css';
	import type { PiholeLists } from '$lib/pihole-lists';
	import { isApplied as isAppliedShared, normalizeDomain } from '$lib/pihole-lists';
	import { csrfHeaders } from '$lib/csrf-client';
	import AuthGate from '$lib/AuthGate.svelte';
	import { isUnauthorizedStatus, unauthorizedMessage } from '$lib/auth-client';
	import { describeApiFailure } from '$lib/api-errors';

	type Notice = { id: string; kind: 'error' | 'ok'; message: string };
	let notices = $state<Notice[]>([]);

	type Health = { ok: boolean; status: number; latency_ms: number; payload: any };
	let health = $state<Health | null>(null);
	let loading = $state(true);

	let blocked = $state<{ exact: string[]; wildcard: string[] } | null>(null);
	let allowed = $state<{ exact: string[]; wildcard: string[] } | null>(null);
	let listsLoading = $state(true);
	let listsError = $state<string | null>(null);
	let needsAuth = $state(false);

	let listFilter = $state('');

	let domainInput = $state('');
	let busy = $state(false);
	let isAdmin = $state(false);

	function pushNotice(kind: Notice['kind'], message: string, ttlMs = 4500) {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		notices = [...notices, { id, kind, message }];
		setTimeout(() => {
			notices = notices.filter((n) => n.id !== id);
		}, ttlMs);
	}

	async function refreshHealth() {
		loading = health === null;
		const res = await fetch('/api/pihole/health', { headers: { 'cache-control': 'no-cache' } });
		health = res.ok ? await res.json() : { ok: false, status: res.status, latency_ms: -1, payload: null };
		loading = false;
	}

	const filteredLists = $derived.by(() => {
		const f = listFilter.trim().toLowerCase();
		const filt = (arr: string[]) => (f ? arr.filter((x) => x.toLowerCase().includes(f)) : arr);
		return {
			blocked: {
				exact: filt(blocked?.exact ?? []),
				wildcard: filt(blocked?.wildcard ?? [])
			},
			allowed: {
				exact: filt(allowed?.exact ?? []),
				wildcard: filt(allowed?.wildcard ?? [])
			}
		};
	});

	const listFilterActive = $derived(Boolean(listFilter.trim()));
	const filteredEntryCount = $derived.by(() => {
		const f = filteredLists;
		return (
			f.blocked.exact.length +
			f.blocked.wildcard.length +
			f.allowed.exact.length +
			f.allowed.wildcard.length
		);
	});

	function isApplied(domainRaw: string, list: 'black' | 'white', mode: 'exact' | 'wildcard') {
		const lists: PiholeLists | null = blocked && allowed ? { blocked, allowed } : null;
		return isAppliedShared(lists, domainRaw, list, mode);
	}

	async function loadLists() {
		listsLoading = blocked === null && allowed === null;
		listsError = null;
		needsAuth = false;
		const res = await fetch('/api/admin/pihole/lists', { headers: { 'cache-control': 'no-cache' } });
		const data = await res.json().catch(() => null);
		if (!res.ok) {
			blocked = { exact: [], wildcard: [] };
			allowed = { exact: [], wildcard: [] };
			needsAuth = isUnauthorizedStatus(res.status);
			listsError = needsAuth
				? unauthorizedMessage(res.status)
				: ((data as { message?: string } | null)?.message ??
					`No se pudieron leer las listas de Pi-hole (HTTP ${res.status}). Revisa PIHOLE_BASE_URL y PIHOLE_API_TOKEN.`);
			pushNotice('error', listsError, 10_000);
			listsLoading = false;
			return;
		}
		blocked = {
			exact: (data?.blocked?.exact ?? []) as string[],
			wildcard: (data?.blocked?.wildcard ?? []) as string[]
		};
		allowed = {
			exact: (data?.allowed?.exact ?? []) as string[],
			wildcard: (data?.allowed?.wildcard ?? []) as string[]
		};
		const partial = (data as { partial?: boolean; errors?: string[] } | null)?.errors;
		if (partial?.length) {
			listsError = partial.join(' · ');
			pushNotice('error', `Listas incompletas: ${listsError}`, 9000);
		}
		const total =
			blocked.exact.length + blocked.wildcard.length + allowed.exact.length + allowed.wildcard.length;
		if (total === 0 && !partial?.length) {
			listsError = 'Pi-hole devolvió listas vacías. Si acabas de bloquear dominios, pulsa Refrescar.';
		}
		listsLoading = false;
	}

	async function piholeList(
		domainRaw: string,
		list: 'black' | 'white',
		op: 'add' | 'remove' = 'add',
		mode: 'exact' | 'wildcard' = 'exact'
	) {
		const domain = normalizeDomain(domainRaw);
		if (!domain) {
			pushNotice('error', 'Dominio vacío');
			return;
		}
		busy = true;
		const res = await fetch('/api/admin/pihole/domain', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({ domain, list, op, mode })
		});
		const body = await res.json().catch(() => null);
		if (!res.ok || body?.ok === false) {
			const fail = describeApiFailure(res.status, body, 'Pi-hole: error en la petición.');
			pushNotice('error', fail.message, fail.rateLimited ? 10_000 : 8000);
			busy = false;
			return;
		}
		const label =
			op === 'remove'
				? list === 'black'
					? mode === 'wildcard'
						? `Quitado bloque (*): ${domain}`
						: `Quitado bloque: ${domain}`
					: mode === 'wildcard'
						? `Quitado permitir (*): ${domain}`
						: `Quitado permitir: ${domain}`
				: list === 'black'
					? mode === 'wildcard'
						? `Bloqueado (*): ${domain}`
						: `Bloqueado: ${domain}`
					: mode === 'wildcard'
						? `Permitido (*): ${domain}`
						: `Permitido: ${domain}`;
		pushNotice('ok', body?.message ?? label, 6500);

		if (list === 'black' && op === 'add') {
			const check = await fetch(
				`/api/admin/pihole/dns-check?domain=${encodeURIComponent(domain)}`,
				{ headers: { 'cache-control': 'no-cache' } }
			);
			if (check.ok) {
				const dns = (await check.json().catch(() => null)) as {
					blocked?: boolean;
					message?: string;
				} | null;
				if (dns?.message) {
					pushNotice(dns.blocked ? 'ok' : 'error', dns.message, 12_000);
				}
			}

			const rel = await fetch(
				`/api/admin/pihole/related-domains?domain=${encodeURIComponent(domain)}&minutes=180`,
				{ headers: { 'cache-control': 'no-cache' } }
			);
			if (rel.ok) {
				const data = (await rel.json().catch(() => null)) as {
					related?: { domain: string; count: number }[];
				} | null;
				const extras = data?.related ?? [];
				if (extras.length) {
					const names = extras
						.slice(0, 4)
						.map((x) => x.domain)
						.join(', ');
					pushNotice(
						'error',
						`La tienda también usa otros dominios (${names}). Bloquéalos con «Bloquear *» o añádelos uno a uno; si no, la web puede seguir cargando recursos.`,
						18_000
					);
				}
			}
		}

		busy = false;
		await refreshHealth();
		await loadLists();
	}

	onMount(async () => {
		const meRes = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
		if (meRes.ok) {
			const me = (await meRes.json().catch(() => null)) as { isAdmin?: boolean } | null;
			isAdmin = Boolean(me?.isAdmin);
		}
		refreshHealth();
		loadLists();
	});
</script>

<main class="pageWrap pageWide page-pihole" id="contenido-principal" tabindex="-1">
	{#if notices.length}
		<div
			class="toasts"
			role="region"
			aria-label="Notificaciones"
			aria-live="polite"
			aria-relevant="additions"
		>
			{#each notices as n (n.id)}
				<div class="toast {n.kind}">
					<span>{n.message}</span>
					<button
						type="button"
						class="toastClose"
						aria-label="Cerrar notificación"
						onclick={() => (notices = notices.filter((x) => x.id !== n.id))}
					>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if needsAuth}
		<AuthGate message={listsError ?? undefined} />
	{/if}

	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Listas Pi-hole</h1>
			<p class="panelHero__sub">Permitir, bloquear y consultar dominios en Pi-hole.</p>
		</div>
		<div class="panelHero__actions">
			<button
				type="button"
				class="btn secondary btnAccent"
				onclick={refreshHealth}
				disabled={loading}
				aria-busy={loading ? 'true' : undefined}
				aria-label={loading ? 'Actualizando estado de Pi-hole' : 'Actualizar estado de Pi-hole'}
			>
				{loading ? 'Cargando…' : 'Refrescar'}
			</button>
		</div>
	</header>

	<section class="panel">
		<h2 class="panel__h2">Estado</h2>
		<div class="grid">
			<div class="pill {health?.ok ? 'ok' : 'bad'}">
				<span class="k">Health</span>
				<span class="v">{health?.ok ? 'OK' : 'ERROR'}</span>
			</div>
			<div class="pill">
				<span class="k">HTTP</span>
				<span class="v">{health ? health.status : '-'}</span>
			</div>
			<div class="pill">
				<span class="k">Latencia</span>
				<span class="v">{health ? `${health.latency_ms} ms` : '-'}</span>
			</div>
			<div class="pill">
				<span class="k">Status</span>
				<span class="v">{health?.payload?.status ?? '-'}</span>
			</div>
		</div>
	</section>

	{#if isAdmin}
	<section class="panel">
		<h2 class="panel__h2">Listas rápidas</h2>
		<p class="listasHint muted">
			Con <strong>VPN</strong> el móvil debe resolver DNS por el túnel (vuestras consultas salen como <span class="mono">10.8.0.x</span> en la pestaña DNS).
			Además de Chrome: en Android → Ajustes → Red → <strong>DNS privado</strong> = Desactivado. Muchas tiendas usan varios dominios (CDN, API);
			bloquead también <strong>Bloquear *</strong> o los dominios extra que avise el panel.
		</p>
		<div class="quick">
			<label for="pihole-domain-quick" class="visually-hidden">Dominio para permitir o bloquear</label>
			<input
				id="pihole-domain-quick"
				class="input"
				placeholder="ej: youtube.com o *.youtube.com"
				bind:value={domainInput}
				autocomplete="off"
			/>
			<div class="btns">
				<button
					type="button"
					class="btn btnMini btnSecondary {isApplied(domainInput, 'white', 'exact') ? 'applied' : ''}"
					disabled={busy || isApplied(domainInput, 'white', 'exact')}
					onclick={() => piholeList(domainInput, 'white')}
				>
					{isApplied(domainInput, 'white', 'exact') ? 'Permitido' : 'Permitir'}
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary {isApplied(domainInput, 'black', 'exact') ? 'applied' : ''}"
					disabled={busy || isApplied(domainInput, 'black', 'exact')}
					onclick={() => piholeList(domainInput, 'black')}
				>
					{isApplied(domainInput, 'black', 'exact') ? 'Bloqueado' : 'Bloquear'}
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary {isApplied(domainInput, 'white', 'wildcard') ? 'applied' : ''}"
					disabled={busy || isApplied(domainInput, 'white', 'wildcard')}
					onclick={() => piholeList(domainInput, 'white', 'add', 'wildcard')}
				>
					{isApplied(domainInput, 'white', 'wildcard') ? 'Permitido *' : 'Permitir *'}
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary {isApplied(domainInput, 'black', 'wildcard') ? 'applied' : ''}"
					disabled={busy || isApplied(domainInput, 'black', 'wildcard')}
					onclick={() => piholeList(domainInput, 'black', 'add', 'wildcard')}
				>
					{isApplied(domainInput, 'black', 'wildcard') ? 'Bloqueado *' : 'Bloquear *'}
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary"
					disabled={busy || !isApplied(domainInput, 'white', 'exact')}
					onclick={() => piholeList(domainInput, 'white', 'remove')}
				>
					Quitar perm.
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary"
					disabled={busy || !isApplied(domainInput, 'black', 'exact')}
					onclick={() => piholeList(domainInput, 'black', 'remove')}
				>
					Quitar bloq.
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary"
					disabled={busy || !isApplied(domainInput, 'white', 'wildcard')}
					onclick={() => piholeList(domainInput, 'white', 'remove', 'wildcard')}
				>
					Quitar perm.*
				</button>
				<button
					type="button"
					class="btn btnMini btnSecondary"
					disabled={busy || !isApplied(domainInput, 'black', 'wildcard')}
					onclick={() => piholeList(domainInput, 'black', 'remove', 'wildcard')}
				>
					Quitar bloq.*
				</button>
			</div>
		</div>
		<p class="muted">El modo “*” aplica a subdominios (regex en Pi-hole).</p>
	</section>
	{:else}
	<section class="panel panel--readonly">
		<h2 class="panel__h2">Listas rápidas</h2>
		<p class="muted">Solo los administradores pueden modificar listas desde esta interfaz.</p>
	</section>
	{/if}

	<section class="panel">
		<div class="row">
			<h2 class="panel__h2">Listas</h2>
			<div class="rowRight">
				<label for="pihole-list-filter" class="visually-hidden">Filtrar entradas de las listas</label>
				<input
					id="pihole-list-filter"
					class="input miniInp"
					placeholder="Filtrar (contiene…)"
					bind:value={listFilter}
					autocomplete="off"
				/>
				<button
					type="button"
					class="btn btnSecondary btnMini"
					onclick={loadLists}
					disabled={listsLoading}
					aria-busy={listsLoading ? 'true' : undefined}
					aria-label={listsLoading ? 'Recargando listas de Pi-hole' : 'Recargar listas de Pi-hole'}
				>
					{listsLoading ? 'Cargando…' : 'Refrescar'}
				</button>
			</div>
		</div>

		{#if listFilterActive}
			<p class="muted listFilterMeta">
				{filteredEntryCount} coincidencia(s) con «<span class="mono">{listFilter.trim()}</span>»
			</p>
		{/if}

		{#if listsError && !listsLoading}
			<p class="listasError" role="alert">{listsError}</p>
		{/if}

		{#if listsLoading}
			<p class="muted">Cargando…</p>
		{:else if !blocked || !allowed}
			<p class="muted">Sin datos.</p>
		{:else if listFilterActive && filteredEntryCount === 0}
			<p class="muted">Ninguna entrada coincide con el filtro.</p>
		{:else}
			<div class="cols">
				<div>
					<div class="tag">Blacklist exacta ({filteredLists.blocked.exact.length})</div>
					<ul class="lst">
						{#each filteredLists.blocked.exact as d, i (`b:${d}:${i}`)}
						<li class="listEntry">
							<span class="mono listEntry__domain" title={d}>{d}</span>
							{#if isAdmin}
							<button
							type="button"
							class="btn btnMini btnSecondary"
							disabled={busy}
							onclick={() => piholeList(d, 'black', 'remove', 'exact')}
							>
							Quitar
							</button>
							{/if}
						</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="tag">Blacklist wildcard/regex ({filteredLists.blocked.wildcard.length})</div>
					<ul class="lst">
						{#each filteredLists.blocked.wildcard as d, i (`br:${d}:${i}`)}
						<li class="listEntry">
							<span class="mono listEntry__domain" title={d}>{d}</span>
							{#if isAdmin}
							<button
							type="button"
							class="btn btnMini btnSecondary"
							disabled={busy}
							onclick={() => piholeList(d, 'black', 'remove', 'wildcard')}
							>
							Quitar
							</button>
							{/if}
						</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="tag">Whitelist exacta ({filteredLists.allowed.exact.length})</div>
					<ul class="lst">
						{#each filteredLists.allowed.exact as d, i (`w:${d}:${i}`)}
						<li class="listEntry">
							<span class="mono listEntry__domain" title={d}>{d}</span>
							{#if isAdmin}
							<button
							type="button"
							class="btn btnMini btnSecondary"
							disabled={busy}
							onclick={() => piholeList(d, 'white', 'remove', 'exact')}
							>
							Quitar
							</button>
							{/if}
						</li>
						{/each}
					</ul>
				</div>
				<div>
					<div class="tag">Whitelist wildcard/regex ({filteredLists.allowed.wildcard.length})</div>
					<ul class="lst">
						{#each filteredLists.allowed.wildcard as d, i (`wr:${d}:${i}`)}
						<li class="listEntry">
							<span class="mono listEntry__domain" title={d}>{d}</span>
							{#if isAdmin}
							<button
							type="button"
							class="btn btnMini btnSecondary"
							disabled={busy}
							onclick={() => piholeList(d, 'white', 'remove', 'wildcard')}
							>
							Quitar
							</button>
							{/if}
						</li>
						{/each}
					</ul>
				</div>
			</div>
		{/if}
	</section>
</main>

