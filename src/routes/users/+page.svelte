<script lang="ts">
	import { onMount } from 'svelte';
	import './page.css';
	import { apiFetch } from '$lib/api-client';
	import AuthGate from '$lib/AuthGate.svelte';
	import { describeApiFailure, describeFetchResponse, noticeTtl } from '$lib/api-errors';
	import { paginate } from '$lib/table-pager';
	import TablePager from '$lib/TablePager.svelte';

	type UserRow = { status: string; name: string; expiration?: string };

	let users = $state<UserRow[]>([]);
	let aliases = $state<Record<string, string>>({});
	let hiddenRevoked = $state<Set<string>>(new Set());
	let usersLoading = $state(false);
	let usersError = $state<string | null>(null);
	let needsAuth = $state(false);

	let newCn = $state('');
	let newDays = $state(365);
	let creating = $state(false);

	type Notice = { id: string; kind: 'error' | 'ok'; message: string };
	let notices = $state<Notice[]>([]);

	type RowBusy = {
		revoking?: boolean;
		renewing?: boolean;
		alias?: boolean;
		hide?: boolean;
		unhide?: boolean;
		bundle?: boolean;
	};
	let busy = $state<Record<string, RowBusy>>({});

	let isAdmin = $state(false);

	let showHiddenRevokedPanel = $state(false);

	const hiddenRevokedSorted = $derived.by(() =>
		[...hiddenRevoked].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
	);

	let userQ = $state('');
	let userStatus = $state(''); // valid|revoked|''
	let expSoonDays = $state(0); // 0 = off
	let usersPage = $state(1);
	const USERS_PAGE_SIZE = 50;

	function parseExpiry(exp?: string) {
		if (!exp) return null;
		const d = new Date(exp);
		return Number.isFinite(d.getTime()) ? d : null;
	}

	const filteredUsers = $derived.by(() => {
		const q = userQ.trim().toLowerCase();
		const filtered = users.filter((u) => {
			if (u.status === 'revoked' && hiddenRevoked.has(u.name)) return false;
			if (q) {
				const alias = (aliases[u.name] ?? '').toLowerCase();
				if (!u.name.toLowerCase().includes(q) && !alias.includes(q)) return false;
			}
			if (userStatus && u.status !== userStatus) return false;
			if (expSoonDays > 0) {
				const d = parseExpiry(u.expiration);
				if (!d) return false;
				const ms = d.getTime() - Date.now();
				const days = ms / (1000 * 60 * 60 * 24);
				if (days > expSoonDays) return false;
			}
			return true;
		});

		return filtered.toSorted((a, b) => {
			const da = parseExpiry(a.expiration)?.getTime() ?? Number.POSITIVE_INFINITY;
			const db = parseExpiry(b.expiration)?.getTime() ?? Number.POSITIVE_INFINITY;
			return da - db;
		});
	});

	const usersPaged = $derived(paginate(filteredUsers, usersPage, USERS_PAGE_SIZE));

	$effect(() => {
		void userQ;
		void userStatus;
		void expSoonDays;
		usersPage = 1;
	});

	const expAlerts = $derived.by(() => {
		const now = Date.now();
		let exp7 = 0;
		let exp30 = 0;
		for (const u of users) {
			if (u.status !== 'valid') continue;
			const d = parseExpiry(u.expiration);
			if (!d) continue;
			const days = (d.getTime() - now) / (1000 * 60 * 60 * 24);
			if (days <= 7) exp7 += 1;
			if (days <= 30) exp30 += 1;
		}
		return { exp7, exp30 };
	});

	const expiring = $derived.by(() => {
		const now = Date.now();
		const rows = users
			.filter((u) => u.status === 'valid')
			.map((u) => {
				const d = parseExpiry(u.expiration);
				if (!d) return null;
				const daysLeft = Math.ceil((d.getTime() - now) / (1000 * 60 * 60 * 24));
				return {
					cn: u.name,
					exp: d,
					daysLeft
				};
			})
			.filter(Boolean) as { cn: string; exp: Date; daysLeft: number }[];

		rows.sort((a, b) => a.exp.getTime() - b.exp.getTime());

		const within7 = rows.filter((r) => r.daysLeft <= 7);
		const within30 = rows.filter((r) => r.daysLeft <= 30 && r.daysLeft > 7);
		return { within7, within30 };
	});

	function pushNotice(kind: Notice['kind'], message: string, ttlMs = 4500) {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		notices = [...notices, { id, kind, message }];
		setTimeout(() => {
			notices = notices.filter((n) => n.id !== id);
		}, ttlMs);
	}

	function setBusy(cn: string, patch: RowBusy) {
		busy = { ...busy, [cn]: { ...(busy[cn] ?? {}), ...patch } };
	}

	async function loadSession() {
		const res = await fetch('/api/auth/me', { headers: { 'cache-control': 'no-cache' } });
		if (!res.ok) {
			isAdmin = false;
			return;
		}
		const j = (await res.json()) as { isAdmin?: boolean };
		isAdmin = Boolean(j.isAdmin);
	}

	async function loadUsers() {
		usersLoading = true;
		usersError = null;
		needsAuth = false;
		const [usersRes, aliasRes, hiddenRes] = await Promise.all([
			fetch('/api/admin/users', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/admin/user-aliases', { headers: { 'cache-control': 'no-cache' } }),
			fetch('/api/admin/revoked-hidden', { headers: { 'cache-control': 'no-cache' } })
		]);
		if (!usersRes.ok) {
			const fail = await describeFetchResponse(usersRes, 'No se pudo cargar la lista de usuarios.');
			needsAuth = fail.needsAuth;
			usersError = fail.message;
			users = [];
			aliases = {};
			hiddenRevoked = new Set();
			usersLoading = false;
			return;
		}
		users = (await usersRes.json()) as UserRow[];
		aliases = aliasRes.ok ? ((await aliasRes.json()) as Record<string, string>) : {};
		if (hiddenRes.ok) {
			const body = (await hiddenRes.json()) as { hidden?: unknown };
			const arr = Array.isArray(body.hidden) ? body.hidden.filter((x): x is string => typeof x === 'string') : [];
			hiddenRevoked = new Set(arr);
		} else {
			hiddenRevoked = new Set();
		}
		usersLoading = false;
	}

	function displayName(cn: string) {
		return aliases[cn] ?? cn;
	}

	async function revoke(cn: string) {
		setBusy(cn, { revoking: true });
		const res = await apiFetch(`/api/admin/users?cn=${encodeURIComponent(cn)}`, {
			method: 'DELETE'
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			const fail = describeApiFailure(res.status, body, `No se pudo revocar a ${cn}.`);
			pushNotice('error', fail.message, noticeTtl(fail));
			setBusy(cn, { revoking: false });
			return;
		}
		pushNotice('ok', `Revocado: ${displayName(cn)}`, 6500);
		await loadUsers();
		setBusy(cn, { revoking: false });
	}

	async function hideRevokedFromList(cn: string) {
		if (
			!confirm(
				`¿Ocultar "${displayName(cn)}" de esta tabla?\n\nEl certificado seguirá revocado en el servidor; solo dejará de mostrarse aquí.`
			)
		) {
			return;
		}
		setBusy(cn, { hide: true });
		const res = await apiFetch('/api/admin/revoked-hidden', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cn })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			const fail = describeApiFailure(res.status, body, `No se pudo ocultar ${cn}.`);
			pushNotice('error', fail.message, noticeTtl(fail));
			setBusy(cn, { hide: false });
			return;
		}
		pushNotice('ok', `Oculto en la lista: ${displayName(cn)} (sigue revocado en el servidor)`, 6500);
		await loadUsers();
		setBusy(cn, { hide: false });
	}

	async function unhideRevokedFromList(cn: string) {
		setBusy(cn, { unhide: true });
		const res = await apiFetch('/api/admin/revoked-hidden', {
			method: 'DELETE',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cn })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			const fail = describeApiFailure(res.status, body, `No se pudo restaurar ${cn} en la tabla.`);
			pushNotice('error', fail.message, noticeTtl(fail));
			setBusy(cn, { unhide: false });
			return;
		}
		pushNotice('ok', `Vuelve a mostrarse en la tabla: ${displayName(cn)}`, 6500);
		await loadUsers();
		setBusy(cn, { unhide: false });
	}

	function isValidCn(cn: string) {
		return /^[a-zA-Z0-9.@_-]+$/.test(cn) && !cn.startsWith('.') && !cn.startsWith('-') && cn.length <= 64;
	}

	async function createAndDownload(cn: string, days: number) {
		if (!isValidCn(cn)) {
			pushNotice('error', 'CN inválido. Usa solo [a-zA-Z0-9.@_-] (sin empezar por . o -)', 6500);
			return;
		}
		creating = true;
		const res = await apiFetch('/api/admin/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cn, days_valid: days })
		});
		if (!res.ok) {
			const fail = await describeFetchResponse(res, `No se pudo crear o renovar ${cn}.`);
			pushNotice('error', fail.message, noticeTtl(fail, 9000));
			creating = false;
			return;
		}
		const payload = await res.json().catch(() => null);
		const ovpn = payload && typeof payload === 'object' && 'ovpn' in payload ? (payload as any).ovpn : null;
		if (typeof ovpn === 'string' && ovpn.length > 0) {
			const blob = new Blob([ovpn], { type: 'application/x-openvpn-profile' });
			const a = document.createElement('a');
			const url = URL.createObjectURL(blob);
			a.href = url;
			a.download = `${cn}.ovpn`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			pushNotice('ok', `Descarga iniciada: ${cn}.ovpn`, 6500);
		}
		await loadUsers();
		creating = false;
	}

	async function downloadProfileBundle(cn: string) {
		if (!isAdmin) {
			pushNotice('error', 'Solo el administrador puede descargar perfiles.', 6500);
			return;
		}
		if (busy[cn]?.bundle) return;
		setBusy(cn, { bundle: true });
		const res = await fetch(`/api/admin/bundle?cn=${encodeURIComponent(cn)}`);
		if (!res.ok) {
			const fail = await describeFetchResponse(
				res,
				res.status === 502
					? `No se pudo obtener el bundle para ${cn}. Revisa la API en VM1.`
					: `No se pudo descargar el perfil de ${cn}.`
			);
			pushNotice('error', fail.message, noticeTtl(fail, 11_000));
			setBusy(cn, { bundle: false });
			return;
		}
		const blob = await res.blob();
		const cd = res.headers.get('content-disposition');
		const match = cd?.match(/filename=\"?([^\";]+)\"?/i);
		let filename = match?.[1] ?? `${cn}.zip`;
		const ct = res.headers.get('content-type') ?? '';
		if (!match?.[1] && (ct.includes('openvpn') || ct.includes('text/plain'))) {
			filename = `${cn}.ovpn`;
		}
		const a = document.createElement('a');
		const url = URL.createObjectURL(blob);
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		pushNotice('ok', `Descarga iniciada: ${filename}`, 6500);
		setBusy(cn, { bundle: false });
	}

	async function renew(cn: string) {
		if (!confirm(`Renovar ${cn}? (Revoca y crea nuevo certificado)`)) return;
		setBusy(cn, { renewing: true });
		await revoke(cn);
		await createAndDownload(cn, 365);
		setBusy(cn, { renewing: false });
	}

	async function setAlias(cn: string) {
		setBusy(cn, { alias: true });
		const current = aliases[cn] ?? '';
		const next = prompt(`Nombre visible para ${cn} (vacío para quitar)`, current);
		if (next === null) {
			setBusy(cn, { alias: false });
			return;
		}
		const alias = next.trim();
		const res = await apiFetch('/api/admin/user-aliases', {
			method: 'PUT',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ cn, alias: alias || null })
		});
		if (!res.ok) {
			const body = await res.json().catch(() => null);
			const fail = describeApiFailure(res.status, body, 'No se pudo guardar el nombre visible.');
			pushNotice('error', fail.message, noticeTtl(fail));
			setBusy(cn, { alias: false });
			return;
		}
		pushNotice('ok', alias ? `Nombre actualizado: ${alias}` : `Nombre eliminado: ${cn}`, 6500);
		await loadUsers();
		setBusy(cn, { alias: false });
	}

	onMount(async () => {
		await Promise.all([loadSession(), loadUsers()]);
	});
</script>

<main class="pageWrap pageWide page-users" id="contenido-principal" tabindex="-1">
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

	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Usuarios</h1>
			<p class="panelHero__sub">Certificados OpenVPN, alias visibles, perfiles y revocaciones.</p>
		</div>
		<div class="panelHero__actions">
			<button
				type="button"
				class="btn btnSecondary"
				onclick={loadUsers}
				disabled={usersLoading}
				aria-busy={usersLoading ? 'true' : undefined}
				aria-label={usersLoading ? 'Recargando lista de usuarios' : 'Recargar lista de usuarios'}
			>
				{usersLoading ? 'Cargando…' : 'Recargar'}
			</button>
		</div>
	</header>

	<section class="panel">
		<h2 class="panel__h2">Añadir usuario</h2>
		<div class="createForm">
			<label for="users-new-cn" class="visually-hidden">Nombre común del certificado (CN)</label>
			<input
				id="users-new-cn"
				class="input"
				placeholder="CN (ej: Pablo_Practicas)"
				autocomplete="off"
				bind:value={newCn}
			/>
			<label for="users-new-days" class="visually-hidden">Días de validez del certificado</label>
			<input id="users-new-days" class="input" type="number" min="1" max="3650" bind:value={newDays} />
			<button
				type="button"
				class="btn"
				disabled={creating}
				onclick={() => {
					const cn = newCn.trim();
					if (!cn) {
						pushNotice('error', 'CN vacío');
						return;
					}
					createAndDownload(cn, newDays);
				}}
			>
				{creating ? 'Creando…' : 'Crear y descargar .ovpn'}
			</button>
		</div>
		<p class="muted">
			Al crear, se descargará automáticamente el fichero <span class="mono">CN.ovpn</span>.
			{#if isAdmin}
				<span class="mutedBlock">
					Como administrador, en cada fila puedes usar <strong>Descargar perfil</strong> para obtener el bundle que entrega VM1
					(suele ser un ZIP con el <span class="mono">.ovpn</span> y los certificados).
				</span>
			{/if}
		</p>
	</section>

	{#if expAlerts.exp30 > 0}
		<section class="panel panel--warn">
			<strong>Alertas</strong>
			<div class="muted">
				Certificados que caducan pronto: <span class="mono">≤ 7 días: {expAlerts.exp7}</span> ·
				<span class="mono">≤ 30 días: {expAlerts.exp30}</span>
			</div>
			{#if expiring.within7.length}
				<div class="list">
					<div class="tagWarn">≤ 7 días</div>
					<ul>
						{#each expiring.within7 as r (r.cn)}
							<li class="mono">
								{displayName(r.cn)} <span class="dim">({r.cn})</span> — {r.daysLeft}d — {r.exp.toISOString().slice(0, 10)}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
			{#if expiring.within30.length}
				<div class="list">
					<div class="tagWarn">8–30 días</div>
					<ul>
						{#each expiring.within30 as r (r.cn)}
							<li class="mono">
								{displayName(r.cn)} <span class="dim">({r.cn})</span> — {r.daysLeft}d — {r.exp.toISOString().slice(0, 10)}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}

	<section class="panel">
		<h2 class="panel__h2">Listado</h2>
		<div class="panelFilterGrid filtersUsers">
			<label for="users-filter-q" class="visually-hidden">Buscar por CN o nombre visible</label>
			<input id="users-filter-q" class="input" placeholder="Buscar por CN o nombre…" bind:value={userQ} />
			<label for="users-filter-status" class="visually-hidden">Filtrar por estado del certificado</label>
			<select id="users-filter-status" class="input" bind:value={userStatus}>
				<option value="">(todos)</option>
				<option value="valid">valid</option>
				<option value="revoked">revoked</option>
			</select>
			<label for="users-filter-exp" class="visually-hidden">Filtrar por caducidad próxima</label>
			<select id="users-filter-exp" class="input" bind:value={expSoonDays}>
				<option value="0">sin filtro expiración</option>
				<option value="7">expira ≤ 7 días</option>
				<option value="30">expira ≤ 30 días</option>
				<option value="90">expira ≤ 90 días</option>
			</select>
		</div>

		{#if needsAuth}
			<AuthGate message={usersError ?? undefined} nextPath="/users" />
		{:else if usersError}
			<div class="panel cardError">{usersError}</div>
		{:else if usersLoading}
			<p class="muted">Cargando usuarios…</p>
		{:else}
			<p class="muted helpHint">
				La papelera en filas <span class="mono">revoked</span> solo oculta la fila en este panel; el estado en el
				servidor no cambia. Puedes volver a mostrar esos CN desde «Revocados ocultos».
			</p>

			{#if hiddenRevokedSorted.length > 0}
				<div class="hiddenRevokedBar">
					<button
						type="button"
						class="linkLike"
						onclick={() => (showHiddenRevokedPanel = !showHiddenRevokedPanel)}
						aria-expanded={showHiddenRevokedPanel ? 'true' : 'false'}
					>
						{hiddenRevokedSorted.length} revocado(s) oculto(s) de la vista — {showHiddenRevokedPanel
							? 'Ocultar lista'
							: 'Mostrar lista'}
					</button>
					{#if showHiddenRevokedPanel}
						<ul class="hiddenRevokedList">
							{#each hiddenRevokedSorted as hcn (hcn)}
								<li>
									<span class="mono">{displayName(hcn)}</span>
									<span class="dim mono">({hcn})</span>
									<button
										type="button"
										class="btn mini secondary"
										onclick={() => unhideRevokedFromList(hcn)}
										disabled={busy[hcn]?.unhide}
										aria-busy={busy[hcn]?.unhide ? 'true' : undefined}
									>
										{busy[hcn]?.unhide ? 'Restaurando…' : 'Volver a mostrar'}
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}

			{#if filteredUsers.length === 0}
				<div class="usersEmpty">
					<p class="usersEmpty__title">
						{#if users.length === 0}
							No hay usuarios en la lista
						{:else}
							Ningún resultado con los filtros actuales
						{/if}
					</p>
					<p class="muted usersEmpty__body">
						{#if users.length === 0}
							VM1 no devolvió certificados o la lista está vacía. Comprueba la API en VM1 y que existan usuarios
							dados de alta.
						{:else}
							Prueba a borrar el texto de búsqueda, elegir «(todos)» en estado, quitar el filtro de caducidad o
							revisar si los CN revocados están ocultos (bloque «Revocados ocultos» más arriba).
						{/if}
					</p>
				</div>
			{:else}
			<div class="panelTableScroll">
				<table>
					<caption class="visually-hidden">Usuarios y certificados OpenVPN</caption>
					<thead>
						<tr>
							<th scope="col">Estado</th>
							<th scope="col">Nombre</th>
							<th scope="col">CN</th>
							<th scope="col">Expira</th>
							<th scope="col">Acciones</th>
						</tr>
					</thead>
					<tbody>
						{#each usersPaged.page as u, i (`${u.status}:${u.name}:${u.expiration ?? ''}:${i}`)}
							<tr>
								<td>{u.status}</td>
								<td class="mono">{displayName(u.name)}</td>
								<td class="mono">{u.name}</td>
								<td class="mono">{u.expiration ?? '-'}</td>
								<td class="rowActions">
									{#if u.status === 'valid'}
										<button
											type="button"
											class="btn mini secondary"
											aria-label={`Cambiar nombre visible para ${u.name}`}
											onclick={() => setAlias(u.name)}
											disabled={busy[u.name]?.alias}
										>
											{busy[u.name]?.alias ? 'Guardando…' : 'Cambiar nombre'}
										</button>
										<button
											type="button"
											class="btn mini secondary"
											aria-label={`Renovar certificado de ${u.name}`}
											onclick={() => renew(u.name)}
											disabled={busy[u.name]?.renewing || busy[u.name]?.revoking}
										>
											{busy[u.name]?.renewing ? 'Renovando…' : 'Renovar'}
										</button>
										<button
											type="button"
											class="btn mini secondary"
											aria-label={`Revocar certificado de ${u.name}`}
											onclick={() => revoke(u.name)}
											disabled={busy[u.name]?.revoking || busy[u.name]?.renewing}
										>
											{busy[u.name]?.revoking ? 'Revocando…' : 'Revocar'}
										</button>
										{#if isAdmin}
											<button
												type="button"
												class="btn mini secondary"
												title="Descarga el bundle desde VM1 (ZIP con .ovpn si el servidor lo incluye)"
												aria-label={`Descargar perfil VPN de ${u.name}`}
												onclick={() => downloadProfileBundle(u.name)}
												disabled={busy[u.name]?.bundle}
											>
												{busy[u.name]?.bundle ? 'Descargando…' : 'Descargar perfil'}
											</button>
										{/if}
									{:else}
										<button
											type="button"
											class="btn mini"
											aria-label={`Recrear certificado y descargar OVPN para ${u.name}`}
											onclick={() => createAndDownload(u.name, 365)}
											disabled={busy[u.name]?.hide}
										>
											Re-crear
										</button>
										{#if isAdmin}
											<button
												type="button"
												class="btn mini secondary"
												title="Descarga el bundle desde VM1 sin recrear certificado"
												aria-label={`Descargar perfil VPN de ${u.name}`}
												onclick={() => downloadProfileBundle(u.name)}
												disabled={busy[u.name]?.bundle || busy[u.name]?.hide}
											>
												{busy[u.name]?.bundle ? 'Descargando…' : 'Descargar perfil'}
											</button>
										{/if}
										<button
											type="button"
											class="btnTrash"
											title="Quitar de esta lista (solo vista)"
											aria-label={`Quitar de la lista: ${displayName(u.name)}`}
											aria-busy={busy[u.name]?.hide ? 'true' : undefined}
											onclick={() => hideRevokedFromList(u.name)}
											disabled={busy[u.name]?.hide}
										>
											{#if busy[u.name]?.hide}
												<span class="srOnly">Quitando…</span>
											{:else}
												<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
													<path
														fill="currentColor"
														d="M9 3v1H4v2h1v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6h1V4h-5V3H9zm0 5h2v9H9V8zm4 0h2v9h-2V8z"
													/>
												</svg>
											{/if}
										</button>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<TablePager bind:page={usersPage} total={usersPaged.total} pageSize={USERS_PAGE_SIZE} />
			{/if}
		{/if}
	</section>
</main>

