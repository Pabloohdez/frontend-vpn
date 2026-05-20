<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { logoutAndGoHome } from '$lib/logout-client';
	import InternetBlockButton from '$lib/InternetBlockButton.svelte';
	import '../../routes/dashboard.css';

	type VpnClient = {
		cn: string;
		common_name?: string;
		username?: string;
		real_address: string;
		virtual_address: string | null;
		bytes_received: number;
		bytes_sent: number;
		connected_since: string | null;
		connected_seconds: number | null;
	};

	type VpnStatus = {
		updated_at: string;
		total_clients: number;
		total_bytes_received: number;
		total_bytes_sent: number;
		connected_clients: VpnClient[];
	};

	let status = $state<VpnStatus | null>(null);
	let error = $state<{ error: string; status?: number; message?: string } | null>(null);
	let loading = $state(true);
	let lastRefresh = $state(0);
	let interval: ReturnType<typeof setInterval> | null = null;
	let auth = $state<{ configured: boolean; isAdmin: boolean; role?: string | null } | null>(null);
	let loginError = $state<string | null>(null);

	type Notice = { id: string; kind: 'error' | 'ok'; message: string };
	let notices = $state<Notice[]>([]);

	type Vm1Health = { ok: boolean; status: number; latency_ms: number; payload: any };
	let vm1 = $state<Vm1Health | null>(null);

	type UserRow = { status: string; name: string; expiration?: string };
	let users = $state<UserRow[]>([]);
	let virtualToLan = $state<Record<string, string>>({});
	let blockedIps = $state<Set<string>>(new Set());

	const hasPrivilegedSession = $derived(auth?.role === 'admin' || auth?.role === 'auditor');

	const expAlerts = $derived.by(() => {
		const now = Date.now();
		let exp7 = 0;
		let exp30 = 0;
		for (const u of users) {
			if (u.status !== 'valid') continue;
			const exp = u.expiration ? new Date(u.expiration) : null;
			if (!exp || !Number.isFinite(exp.getTime())) continue;
			const days = (exp.getTime() - now) / (1000 * 60 * 60 * 24);
			if (days <= 7) exp7 += 1;
			if (days <= 30) exp30 += 1;
		}
		return { exp7, exp30 };
	});

	function pushNotice(kind: Notice['kind'], message: string, ttlMs = 4500) {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		notices = [...notices, { id, kind, message }];
		setTimeout(() => {
			notices = notices.filter((n) => n.id !== id);
		}, ttlMs);
	}

	function fmtBytes(n: number) {
		if (!Number.isFinite(n)) return '-';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		let v = n;
		let i = 0;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i++;
		}
		return `${v.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
	}

	function badgeHealth(ok: boolean | undefined) {
		if (ok === undefined) return 'statBadge statBadge--muted';
		return ok ? 'statBadge statBadge--good' : 'statBadge statBadge--bad';
	}

	function badgeHttp(code: number | undefined) {
		if (code === undefined || code === null) return 'statBadge statBadge--muted';
		return code >= 200 && code < 300 ? 'statBadge statBadge--good' : 'statBadge statBadge--warn';
	}

	function badgeLatency(ms: number | undefined) {
		if (ms === undefined || ms < 0) return 'statBadge statBadge--muted';
		if (ms < 100) return 'statBadge statBadge--good';
		if (ms < 400) return 'statBadge statBadge--warn';
		return 'statBadge statBadge--bad';
	}

	function vpnStatusErrorHelp(err: { error?: string; message?: string; status?: number } | null) {
		if (!err) return { title: 'Error', detail: 'Respuesta desconocida del servidor.' };
		if (err.error === 'misconfigured') {
			return {
				title: 'Configuración incompleta',
				detail: err.message ?? 'Faltan VPN_API_BASE_URL y/o VPN_API_KEY en el .env del panel.'
			};
		}
		if (err.error === 'upstream_unreachable') {
			return { title: 'VM1 no responde', detail: err.message ?? 'No se pudo contactar con la API de OpenVPN.' };
		}
		if (err.error === 'unauthorized') {
			return { title: 'Sesión requerida', detail: 'Inicia sesión como administrador o auditor.' };
		}
		return {
			title: 'No se pudo obtener el estado VPN',
			detail: typeof err.message === 'string' ? err.message : JSON.stringify(err)
		};
	}

	async function loadAuth() {
		const res = await fetch('/api/auth/me', {
			credentials: 'same-origin',
			headers: { 'cache-control': 'no-cache' }
		});
		auth = res.ok ? await res.json() : { configured: false, isAdmin: false };
	}

	async function loadVm1() {
		const res = await fetch('/api/vpn/health', { headers: { 'cache-control': 'no-cache' } });
		vm1 = res.ok ? await res.json() : { ok: false, status: res.status, latency_ms: -1, payload: null };
	}

	async function loadUsers() {
		const res = await fetch('/api/admin/users', { headers: { 'cache-control': 'no-cache' } });
		users = res.ok ? ((await res.json()) as UserRow[]) : [];
	}

	async function loadInternetBlocks() {
		const res = await fetch('/api/admin/internet-blocks', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			blockedIps = new Set();
			return;
		}
		const j = await res.json().catch(() => ({ blocks: [] }));
		blockedIps = new Set((j.blocks ?? []).map((b: { ip: string }) => String(b.ip)));
	}

	async function loadIpHistory() {
		const res = await fetch('/api/vpn/ipcn-history', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			virtualToLan = {};
			return;
		}
		const j = (await res.json().catch(() => null)) as { virtual_to_real_lan?: Record<string, string> } | null;
		virtualToLan = j?.virtual_to_real_lan ?? {};
	}

	function lanIpForClient(c: VpnClient): string | null {
		const virt = c.virtual_address?.trim();
		if (!virt) return null;
		const lan = virtualToLan[virt] ?? virtualToLan[virt.replace(/\/\d+$/, '')];
		if (lan && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(lan)) return lan;
		return null;
	}

	async function refresh() {
		if (!hasPrivilegedSession) {
			loading = false;
			error = null;
			status = null;
			return;
		}
		loading = status === null;
		error = null;
		lastRefresh = Date.now();
		const res = await fetch('/api/vpn/status', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			error = await res.json().catch(() => ({ error: 'fetch_failed' }));
			status = null;
			loading = false;
			return;
		}
		status = await res.json();
		loading = false;
	}

	// Login ahora se hace desde /login.

	async function logout() {
		if (interval) {
			clearInterval(interval);
			interval = null;
		}
		await logoutAndGoHome();
	}

	async function revealIpFor(cn: string) {
		if (!auth?.isAdmin) {
			pushNotice('error', 'Necesitas login de admin para ver la IP real');
			return;
		}
		const res = await fetch(`/api/vpn/status?reveal_cn=${encodeURIComponent(cn)}`, {
			headers: { 'cache-control': 'no-cache' }
		});
		if (!res.ok) {
			pushNotice('error', 'No se pudo revelar la IP');
			return;
		}
		const newStatus: VpnStatus = await res.json();
		const target = newStatus.connected_clients.find((c) => c.cn === cn);
		if (!target || !status) return;
		status = {
			...status,
			connected_clients: status.connected_clients.map((c) =>
				c.cn === cn ? { ...c, real_address: target.real_address } : c
			)
		};
	}

	async function kick(cn: string) {
		const res = await fetch('/api/admin/kick', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cn })
		});
		if (!res.ok) pushNotice('error', `No se pudo echar a ${cn}`);
		else {
			pushNotice('ok', `Echado: ${cn}`);
			refresh();
		}
	}

	async function revoke(cn: string) {
		const res = await fetch(`/api/admin/users?cn=${encodeURIComponent(cn)}`, { method: 'DELETE' });
		if (!res.ok) pushNotice('error', `No se pudo revocar a ${cn}`);
		else {
			pushNotice('ok', `Revocado: ${cn}`);
			loadUsers();
			refresh();
		}
	}

	async function downloadBundle(cn: string) {
		const res = await fetch(`/api/admin/bundle?cn=${encodeURIComponent(cn)}`);
		if (!res.ok) {
			pushNotice('error', `No se pudo descargar el bundle de ${cn}`, 8000);
			return;
		}
		const blob = await res.blob();
		const a = document.createElement('a');
		const url = URL.createObjectURL(blob);
		a.href = url;
		a.download = `${cn}.zip`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		pushNotice('ok', `Descarga iniciada: ${cn}`);
	}

	onMount(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const el = e.target as HTMLElement | null;
			if (el?.closest('input, textarea, select, [contenteditable="true"]')) return;
			if (e.key === 'r' || e.key === 'R') {
				if (auth?.role !== 'admin' && auth?.role !== 'auditor') return;
				e.preventDefault();
				refresh();
			}
		};
		window.addEventListener('keydown', onKeyDown);
		let cancelled = false;
		(async () => {
			await loadAuth();
			if (cancelled) return;
			if (auth?.role !== 'admin' && auth?.role !== 'auditor') {
				loading = false;
				return;
			}
			await Promise.all([loadVm1(), loadUsers(), loadIpHistory(), loadInternetBlocks()]);
			await refresh();
			interval = setInterval(refresh, 2000);
		})();
		return () => {
			cancelled = true;
			if (interval) clearInterval(interval);
			window.removeEventListener('keydown', onKeyDown);
		};
	});

	onDestroy(() => {
		if (interval) clearInterval(interval);
	});
</script>

<main class="pageWrap pageWide page-dashboard" id="contenido-principal" tabindex="-1">
	<header class="panelHero dashHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">OpenVPN</h1>
			<p class="panelHero__sub">Clientes conectados, métricas y estado de VM1.</p>
		</div>
		<div class="panelHero__actions actions">
			{#if auth?.configured}
				{#if hasPrivilegedSession}
					<button type="button" class="btn secondary" onclick={logout}>Salir</button>
				{:else}
					<a class="btn" href={`/login?next=${encodeURIComponent('/dashboard')}`}>Entrar</a>
				{/if}
			{:else}
				<span class="muted">Auth no configurada</span>
			{/if}
			<button
				type="button"
				class="btn secondary btnAccent"
				onclick={refresh}
				disabled={loading || !hasPrivilegedSession}
			>
				{loading ? 'Cargando…' : 'Actualizar'}
			</button>
			<span class="muted dashShortcut" aria-hidden="true"><kbd>R</kbd></span>
		</div>
	</header>

	{#if notices.length}
		<div class="toasts" role="region" aria-label="Notificaciones" aria-live="polite">
			{#each notices as n (n.id)}
				<div class="toast {n.kind}">
					<span>{n.message}</span>
					<button
						type="button"
						class="toastClose"
						aria-label="Cerrar"
						onclick={() => (notices = notices.filter((x) => x.id !== n.id))}
					>
						×
					</button>
				</div>
			{/each}
		</div>
	{/if}

	{#if loginError}
		<section class="panel cardError">{loginError}</section>
	{/if}

	{#if error}
		{@const errHelp = vpnStatusErrorHelp(error)}
		<section class="panel cardError errorExplain">
			<h2 class="panel__h2">{errHelp.title}</h2>
			<p class="errorDetail">{errHelp.detail}</p>
			<div class="errorActions">
				<button type="button" class="btn secondary" onclick={refresh}>Reintentar</button>
				<a class="btn btnSecondary" href="/users">Ir a usuarios</a>
			</div>
		</section>
	{:else if !status}
		<section class="panel panel--loading">
			{#if auth?.configured && !hasPrivilegedSession}
				<p>Inicia sesión para ver clientes conectados y métricas de VM1.</p>
			{:else if loading}
				<p>Cargando estado…</p>
			{:else}
				<p>Sin datos de estado VPN.</p>
			{/if}
		</section>
	{:else}
		<section class="panelStats dash-stats dash-stats--traffic">
			<div class="panelStat">
				<div class="k">Clientes conectados</div>
				<div class="v statCard__metric">{status.total_clients}</div>
			</div>
			<div class="panelStat">
				<div class="k">Recibido total</div>
				<div class="v statCard__metric">{fmtBytes(status.total_bytes_received)}</div>
			</div>
			<div class="panelStat">
				<div class="k">Enviado total</div>
				<div class="v statCard__metric">{fmtBytes(status.total_bytes_sent)}</div>
			</div>
			<div class="panelStat">
				<div class="k">Última lectura</div>
				<div class="v small statCard__datetime">{new Date(status.updated_at).toLocaleString()}</div>
			</div>
		</section>

		<section class="panelStats dash-stats dash-stats--vm">
			<div class="panelStat">
				<div class="k">VM1 Health</div>
				<div class="v small">
					<span class={badgeHealth(vm1 === null ? undefined : vm1.ok)}>{vm1 === null ? '-' : vm1.ok ? 'OK' : 'ERROR'}</span>
				</div>
			</div>
			<div class="panelStat">
				<div class="k">VM1 HTTP</div>
				<div class="v small"><span class={badgeHttp(vm1?.status)}>{vm1 ? vm1.status : '-'}</span></div>
			</div>
			<div class="panelStat">
				<div class="k">VM1 Latencia</div>
				<div class="v small">
					<span class={badgeLatency(vm1?.latency_ms)}>{vm1 ? `${vm1.latency_ms} ms` : '-'}</span>
				</div>
			</div>
			<div class="panelStat">
				<div class="k">VM1 Versión</div>
				<div class="v small mono statCard__plain">{vm1?.payload?.version ?? '-'}</div>
			</div>
		</section>

		{#if auth?.isAdmin && (expAlerts.exp30 > 0 || vm1?.ok === false)}
			<section class="panel panel--warn dash-alert">
				<h2 class="panel__h2 dash-alert__title">Alertas</h2>
				{#if vm1?.ok === false}
					<p class="mono">OpenVPN/VM1: CAÍDO (HTTP {vm1?.status ?? '-'})</p>
				{/if}
				{#if expAlerts.exp30 > 0}
					<p class="mono">Certificados caducan: ≤7d: {expAlerts.exp7} · ≤30d: {expAlerts.exp30}</p>
				{/if}
			</section>
		{/if}

		<section class="panel dash-clients">
			<div class="tableTop dash-clients__bar">
				<h2 class="panel__h2 dash-clients__h">Clientes</h2>
				<div class="tableActions">
					<span class="muted dash-clients__pill">Auto-refresco · 2s</span>
					{#if auth?.isAdmin}
						<a class="btn btnSecondary btnLink" href="/users">Gestionar usuarios</a>
					{/if}
				</div>
			</div>
			{#if status.connected_clients.length === 0}
				<p class="muted">No hay clientes conectados.</p>
			{:else}
				<div class="panelTableScroll">
					<table>
						<caption class="visually-hidden">Clientes VPN conectados</caption>
						<thead>
							<tr>
								<th scope="col">CN</th>
								<th scope="col">Real</th>
								<th scope="col">Virtual</th>
								<th scope="col">Conectado</th>
								<th scope="col">RX</th>
								<th scope="col">TX</th>
								{#if auth?.isAdmin}<th scope="col">Acciones</th>{/if}
							</tr>
						</thead>
						<tbody>
							{#each status.connected_clients as c (c.cn)}
								<tr>
									<td class="mono">{c.cn}</td>
									<td class="mono">
										{#if c.real_address.includes('*')}
											<button type="button" class="ipBtn" onclick={() => revealIpFor(c.cn)}>{c.real_address}</button>
										{:else}
											{c.real_address}
										{/if}
									</td>
									<td class="mono">{c.virtual_address ?? '-'}</td>
									<td>{c.connected_since ?? '-'}</td>
									<td class="mono">{fmtBytes(c.bytes_received)}</td>
									<td class="mono">{fmtBytes(c.bytes_sent)}</td>
									{#if auth?.isAdmin}
										<td class="rowActions">
											{#if lanIpForClient(c)}
												<InternetBlockButton
													ip={lanIpForClient(c)!}
													label={c.cn}
													cn={c.cn}
													blocked={blockedIps.has(lanIpForClient(c)!)}
													compact
													onchange={loadInternetBlocks}
												/>
											{/if}
											<button type="button" class="btn mini" onclick={() => kick(c.cn)}>Echar</button>
											<button type="button" class="btn mini secondary" onclick={() => revoke(c.cn)}>Revocar</button>
											<button type="button" class="btn mini secondary" onclick={() => downloadBundle(c.cn)}>Bundle</button>
										</td>
									{/if}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}

	<footer class="foot">
		<span class="muted">Refresh: {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : '-'}</span>
		<a href="/status" class="muted">Estado completo →</a>
	</footer>
</main>
