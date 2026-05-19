<script lang="ts">
	import { onMount } from 'svelte';
	import './page.css';

	type Device = {
		ip: string;
		label: string;
		hostname: string | null;
		mac: string | null;
		type: string | null;
		sede_name: string;
		online: boolean;
		blocked: boolean;
		blocked_at: string | null;
		blocked_by: string | null;
		vpn_cn: string | null;
		vpn_connected: boolean;
		in_netmonitor: boolean;
	};

	let devices = $state<Device[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let isAdmin = $state(false);
	let netmonitorConfigured = $state(false);
	let netmonitorReachable = $state(false);
	let search = $state('');
	let onlyOnline = $state(false);
	let onlyBlocked = $state(false);
	let busyIp = $state<string | null>(null);
	let page = $state(1);
	let pageSize = $state(20);

	const PAGE_SIZES = [15, 20, 25, 50] as const;

	const filtered = $derived.by(() => {
		const q = search.trim().toLowerCase();
		return devices.filter((d) => {
			if (onlyOnline && !d.online) return false;
			if (onlyBlocked && !d.blocked) return false;
			if (!q) return true;
			const hay = [d.ip, d.label, d.hostname, d.mac, d.type, d.sede_name, d.vpn_cn]
				.filter(Boolean)
				.join(' ')
				.toLowerCase();
			return hay.includes(q);
		});
	});

	const stats = $derived.by(() => ({
		total: devices.length,
		online: devices.filter((d) => d.online).length,
		blocked: devices.filter((d) => d.blocked).length,
		vpn: devices.filter((d) => d.vpn_connected).length
	}));

	const totalPages = $derived(Math.max(1, Math.ceil(filtered.length / pageSize) || 1));

	const paged = $derived.by(() => {
		const safePage = Math.min(Math.max(1, page), totalPages);
		const start = (safePage - 1) * pageSize;
		return filtered.slice(start, start + pageSize);
	});

	const pageRange = $derived.by(() => {
		if (filtered.length === 0) return { from: 0, to: 0 };
		const safePage = Math.min(Math.max(1, page), totalPages);
		const from = (safePage - 1) * pageSize + 1;
		const to = Math.min(safePage * pageSize, filtered.length);
		return { from, to };
	});

	$effect(() => {
		void search;
		void onlyOnline;
		void onlyBlocked;
		page = 1;
	});

	$effect(() => {
		if (page > totalPages) page = totalPages;
		if (page < 1) page = 1;
	});

	async function load() {
		loading = devices.length === 0;
		error = null;
		const [meRes, devRes] = await Promise.all([
			fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/admin/network-devices', { headers: { 'cache-control': 'no-cache' } })
		]);
		if (meRes.ok) {
			const me = await meRes.json();
			isAdmin = Boolean(me?.isAdmin);
		}
		if (!devRes.ok) {
			error =
				devRes.status === 401
					? 'Necesitas sesión de administrador o auditor'
					: `Error al cargar dispositivos (${devRes.status})`;
			devices = [];
			loading = false;
			return;
		}
		const j = await devRes.json();
		devices = j.devices ?? [];
		netmonitorConfigured = Boolean(j.configured);
		netmonitorReachable = Boolean(j.reachable);
		loading = false;
	}

	async function toggleBlock(d: Device) {
		if (!isAdmin || busyIp) return;
		const op = d.blocked ? 'unblock' : 'block';
		const ok = confirm(
			op === 'block'
				? `¿Bloquear internet (DNS) para ${d.label} (${d.ip})?`
				: `¿Restaurar internet (DNS) para ${d.label} (${d.ip})?`
		);
		if (!ok) return;
		busyIp = d.ip;
		const res = await fetch('/api/admin/internet-block', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				ip: d.ip,
				op,
				label: d.label,
				cn: d.vpn_cn
			})
		});
		const j = await res.json().catch(() => ({}));
		if (!res.ok || !j.ok) {
			alert(j.message ?? `Error ${res.status}`);
		} else {
			await load();
		}
		busyIp = null;
	}

	onMount(load);
</script>

<main class="pageWrap pageWide page-pihole-blocks" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Dispositivos en red</h1>
			<p class="panelHero__sub">
				Todos los equipos detectados en vuestra red (netmonitor). Puedes cortar o restaurar su internet vía Pi-hole
				(bloqueo DNS). Requiere Pi-hole v6 y token de aplicación.
			</p>
		</div>
		<div class="panelHero__actions">
			<button type="button" class="btn secondary btnAccent" disabled={loading} onclick={load}>
				{loading ? 'Cargando…' : 'Actualizar'}
			</button>
		</div>
	</header>

	{#if error}
		<section class="panel cardError">{error}</section>
	{:else}
		{#if netmonitorConfigured && !netmonitorReachable}
			<section class="panel cardWarn blockBanner">
				<p>
					<strong>Netmonitor no alcanzable.</strong> Solo verás dispositivos que ya tengan un bloqueo activo en el
					panel. Revisa <span class="mono">NETMONITOR_BASE_URL</span> y la API key.
				</p>
			</section>
		{:else if !netmonitorConfigured}
			<section class="panel cardWarn blockBanner">
				<p>
					<strong>Netmonitor no configurado.</strong> Configura el inventario de red en Ajustes para listar todos los
					dispositivos.
				</p>
			</section>
		{/if}

		<section class="panel blockStats" aria-label="Resumen">
			<div class="blockStats__grid">
				<div class="pill">
					<span class="k">Dispositivos</span>
					<span class="v">{stats.total}</span>
				</div>
				<div class="pill ok">
					<span class="k">En línea</span>
					<span class="v">{stats.online}</span>
				</div>
				<div class="pill">
					<span class="k">VPN ahora</span>
					<span class="v">{stats.vpn}</span>
				</div>
				<div class="pill {stats.blocked ? 'bad' : ''}">
					<span class="k">Sin internet</span>
					<span class="v">{stats.blocked}</span>
				</div>
			</div>
		</section>

		<section class="panel">
			<div class="blockToolbar">
				<label class="panelFilterLab" for="dev-search">Buscar</label>
				<input
					id="dev-search"
					class="input blockToolbar__search"
					placeholder="Nombre, IP, MAC, sede, CN VPN…"
					bind:value={search}
					autocomplete="off"
				/>
				<label class="blockToolbar__check">
					<input type="checkbox" bind:checked={onlyOnline} />
					Solo en línea
				</label>
				<label class="blockToolbar__check">
					<input type="checkbox" bind:checked={onlyBlocked} />
					Solo bloqueados
				</label>
			</div>

			{#if loading}
				<p class="muted blockTableHint">Cargando dispositivos…</p>
			{:else if filtered.length === 0}
				<p class="muted blockTableHint">
					{devices.length === 0
						? 'No hay dispositivos en el inventario.'
						: 'Ningún dispositivo coincide con los filtros.'}
				</p>
			{:else}
				<div class="panelTableScroll blockTableWrap">
					<table class="blockTable">
						<thead>
							<tr>
								<th scope="col">Dispositivo</th>
								<th scope="col">IP</th>
								<th scope="col">Sede</th>
								<th scope="col">Red</th>
								<th scope="col">VPN</th>
								<th scope="col">Internet</th>
								{#if isAdmin}
									<th scope="col" class="blockTable__actions">Acción</th>
								{/if}
							</tr>
						</thead>
						<tbody>
							{#each paged as d (d.ip)}
								<tr class:rowBlocked={d.blocked}>
									<td>
										<span class="blockTable__name">{d.label}</span>
										{#if d.hostname && d.hostname !== d.label}
											<div class="muted blockTable__sub mono">{d.hostname}</div>
										{/if}
										{#if d.type}
											<div class="muted blockTable__sub">{d.type}</div>
										{/if}
									</td>
									<td class="mono">{d.ip}</td>
									<td>{d.sede_name || '—'}</td>
									<td>
										<span class="statusPill {d.online ? 'statusPill--ok' : 'statusPill--muted'}">
											{d.online ? 'En línea' : 'Inactivo'}
										</span>
									</td>
									<td>
										{#if d.vpn_connected && d.vpn_cn}
											<span class="statusPill statusPill--vpn" title="Conectado ahora por VPN">{d.vpn_cn}</span>
										{:else if d.vpn_cn}
											<span class="muted mono" title="Visto antes en VPN">{d.vpn_cn}</span>
										{:else}
											<span class="muted">—</span>
										{/if}
									</td>
									<td>
										<span class="statusPill {d.blocked ? 'statusPill--bad' : 'statusPill--ok'}">
											{d.blocked ? 'Bloqueado' : 'Activo'}
										</span>
										{#if d.blocked && d.blocked_at}
											<div class="muted blockTable__sub">
												{d.blocked_at.slice(0, 16).replace('T', ' ')}
											</div>
										{/if}
									</td>
									{#if isAdmin}
										<td class="blockTable__actions">
											{#if busyIp === d.ip}
												<span class="muted">…</span>
											{:else}
												<button
													type="button"
													class="btn btnMini {d.blocked ? 'btnRestoreNet' : 'btnCutNet'}"
													onclick={() => toggleBlock(d)}
												>
													{d.blocked ? 'Restaurar' : 'Cortar internet'}
												</button>
											{/if}
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<nav class="blockPager" aria-label="Paginación de dispositivos">
					<div class="blockPager__meta muted">
						{pageRange.from}–{pageRange.to} de {filtered.length}
						{#if filtered.length !== devices.length}
							(filterados; total {devices.length})
						{/if}
					</div>
					<label class="blockPager__size">
						<span class="muted">Por página</span>
						<select
							class="input blockPager__select"
							bind:value={pageSize}
							onchange={() => (page = 1)}
						>
							{#each PAGE_SIZES as n (n)}
								<option value={n}>{n}</option>
							{/each}
						</select>
					</label>
					<div class="blockPager__nav">
						<button
							type="button"
							class="btn btnSecondary btnMini"
							disabled={page <= 1}
							onclick={() => (page = Math.max(1, page - 1))}
						>
							Anterior
						</button>
						<span class="blockPager__status" aria-live="polite">
							Página {Math.min(page, totalPages)} / {totalPages}
						</span>
						<button
							type="button"
							class="btn btnSecondary btnMini"
							disabled={page >= totalPages}
							onclick={() => (page = Math.min(totalPages, page + 1))}
						>
							Siguiente
						</button>
					</div>
				</nav>
			{/if}
		</section>
	{/if}
</main>
