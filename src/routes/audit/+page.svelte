<script lang="ts">
	import { onMount, tick } from 'svelte';
	import AuthGate from '$lib/AuthGate.svelte';
	import ErrorPanel from '$lib/ErrorPanel.svelte';
	import Skeleton from '$lib/Skeleton.svelte';
	import TablePager from '$lib/TablePager.svelte';
	import { describeFetchResponse } from '$lib/api-errors';
	import { downloadSpreadsheet } from '$lib/spreadsheet-export';
	import { filterRowsByQuery, paginate } from '$lib/table-pager';
	import './page.css';

	type Row = {
		ts: string;
		actor: string;
		action: string;
		target_cn: string | null;
		success: boolean;
		remote_ip: string | null;
		details: any;
	};

	let rows = $state<Row[]>([]);
	let error = $state<string | null>(null);
	let needsAuth = $state(false);
	let loading = $state(true);

	type Notice = { id: string; kind: 'error' | 'ok'; message: string };
	let notices = $state<Notice[]>([]);

	let detailModal = $state<Row | null>(null);

	let fromDay = $state('');
	let toDay = $state('');
	let action = $state('');
	let cn = $state('');
	let ok = $state(''); // '' | '1' | '0'
	let limit = $state(200);
	let tableSearch = $state('');
	let auditPage = $state(1);
	const AUDIT_PAGE_SIZE = 50;

	const filteredRows = $derived(filterRowsByQuery(rows, tableSearch, (r) =>
		[r.ts, r.actor, r.action, r.target_cn ?? '', r.remote_ip ?? '', JSON.stringify(r.details ?? '')].join(' ')
	));
	const paged = $derived(paginate(filteredRows, auditPage, AUDIT_PAGE_SIZE));

	function pushNotice(kind: Notice['kind'], message: string, ttlMs = 2800) {
		const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		notices = [...notices, { id, kind, message }];
		setTimeout(() => {
			notices = notices.filter((n) => n.id !== id);
		}, ttlMs);
	}

	function previewDetails(d: unknown, max = 120) {
		try {
			const s = JSON.stringify(d);
			if (s.length <= max) return s;
			return `${s.slice(0, max)}…`;
		} catch {
			return String(d);
		}
	}

	async function load(opts?: { notify?: 'apply' | 'reset' }) {
		loading = true;
		error = null;
		needsAuth = false;
		const q = new URLSearchParams();
		if (limit) q.set('limit', String(limit));
		if (fromDay) q.set('from', fromDay);
		if (toDay) q.set('to', toDay);
		if (action) q.set('action', action);
		if (cn) q.set('cn', cn);
		if (ok) q.set('ok', ok);
		const res = await fetch(`/api/admin/audit?${q.toString()}`);
		if (!res.ok) {
			const fail = await describeFetchResponse(res, 'No se pudo cargar la auditoría.');
			needsAuth = fail.needsAuth;
			error = fail.message;
			rows = [];
			loading = false;
			return;
		}
		rows = await res.json();
		auditPage = 1;
		loading = false;

		if (opts?.notify === 'apply') {
			pushNotice('ok', 'Filtros aplicados.', 2600);
			await tick();
			document.getElementById('audit-apply')?.focus();
		} else if (opts?.notify === 'reset') {
			pushNotice('ok', 'Filtros limpiados.', 2600);
			await tick();
			document.getElementById('audit-apply')?.focus();
		}
	}

	async function clearFilters() {
		fromDay = '';
		toDay = '';
		action = '';
		cn = '';
		ok = '';
		limit = 200;
		await load({ notify: 'reset' });
	}

	$effect(() => {
		if (!detailModal) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') detailModal = null;
		};
		window.addEventListener('keydown', onKey);
		tick().then(() => {
			document.querySelector<HTMLButtonElement>('.auditModalClose')?.focus();
		});
		return () => window.removeEventListener('keydown', onKey);
	});

	onMount(() => {
		load();
	});

	function serverExportQuery() {
		const q = new URLSearchParams();
		q.set('limit', String(Math.min(5000, limit || 2000)));
		if (fromDay) q.set('from', fromDay);
		if (toDay) q.set('to', toDay);
		if (action) q.set('action', action);
		if (cn) q.set('cn', cn);
		if (ok === '1') q.set('success', 'true');
		if (ok === '0') q.set('success', 'false');
		return q;
	}

	function serverExportUrl(format: 'csv' | 'xls' | 'xlsx' = 'csv') {
		const q = serverExportQuery();
		if (format === 'xls') q.set('format', 'xls');
		if (format === 'xlsx') q.set('format', 'xlsx');
		return `/api/admin/audit/export?${q.toString()}`;
	}

	function download(kind: 'json' | 'csv' | 'xls') {
		const data = filteredRows;
		if (kind === 'json') {
			const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
			const a = document.createElement('a');
			const url = URL.createObjectURL(blob);
			a.href = url;
			a.download = `audit-${new Date().toISOString().slice(0, 10)}.json`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
			return;
		}

		const header = ['ts', 'actor', 'action', 'target_cn', 'success', 'remote_ip', 'details'];
		const rowCells = (r: Row) =>
			[
				r.ts,
				r.actor,
				r.action,
				r.target_cn ?? '',
				String(r.success),
				r.remote_ip ?? '',
				typeof r.details === 'string' ? r.details : JSON.stringify(r.details ?? null)
			] as string[];

		if (kind === 'xls') {
			downloadSpreadsheet(
				`audit-${new Date().toISOString().slice(0, 10)}.xls`,
				'Auditoría',
				header,
				data.map(rowCells)
			);
			return;
		}

		const esc = (v: unknown) => {
			const s = typeof v === 'string' ? v : JSON.stringify(v ?? null);
			return `"${s.replaceAll('"', '""')}"`;
		};
		const lines = [
			header.join(','),
			...data.map((r) => rowCells(r).map(esc).join(','))
		].join('\n');
		const blob = new Blob(['\uFEFF' + lines], { type: 'text/csv;charset=utf-8' });
		const a = document.createElement('a');
		const url = URL.createObjectURL(blob);
		a.href = url;
		a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
	}
</script>

<main class="pageWrap pageWide page-audit" id="contenido-principal" tabindex="-1">
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
			<h1 class="panelHero__title">Auditoría</h1>
			<p class="panelHero__sub">Registro de acciones administrativas: logins, usuarios, listas y más.</p>
		</div>
		<div class="panelHero__actions">
			<a
				class="btn secondary"
				href={serverExportUrl('csv')}
				download
				aria-label="Descargar auditoría en CSV (servidor, hasta 5000 filas)"
			>
				CSV servidor
			</a>
			<a
				class="btn secondary"
				href={serverExportUrl('xls')}
				download
				aria-label="Descargar auditoría en Excel (servidor, hasta 5000 filas)"
			>
				Excel servidor
			</a>
			<button
				type="button"
				class="btn secondary"
				onclick={() => download('csv')}
				disabled={loading || filteredRows.length === 0}
				aria-label="Descargar tabla filtrada en CSV"
			>
				CSV tabla
			</button>
			<button
				type="button"
				class="btn secondary"
				onclick={() => download('xls')}
				disabled={loading || filteredRows.length === 0}
				aria-label="Descargar tabla filtrada en Excel"
			>
				Excel tabla
			</button>
			<button
				type="button"
				class="btn secondary"
				onclick={() => download('json')}
				disabled={loading || rows.length === 0}
				aria-label="Descargar auditoría en JSON"
			>
				JSON
			</button>
			<button type="button" class="btn secondary" onclick={clearFilters}>Limpiar filtros</button>
			<button
				type="button"
				id="audit-apply"
				class="btn secondary btnAccent"
				onclick={() => load({ notify: 'apply' })}
				disabled={loading}
				aria-busy={loading ? 'true' : undefined}
				aria-label={loading ? 'Cargando auditoría' : 'Aplicar filtros de auditoría'}
			>
				{loading ? 'Cargando…' : 'Aplicar'}
			</button>
		</div>
	</header>

	<section class="panel" aria-label="Filtros de auditoría">
		<h2 class="panel__h2">Filtros</h2>
		<div class="panelFilterGrid">
		<div class="frow">
			<label class="lab" for="audit-limit">Límite</label>
			<input id="audit-limit" class="inp" type="number" min="1" max="1000" bind:value={limit} />
		</div>
		<div class="frow">
			<label class="lab" for="audit-from">Desde</label>
			<input id="audit-from" class="inp" type="date" bind:value={fromDay} />
		</div>
		<div class="frow">
			<label class="lab" for="audit-to">Hasta</label>
			<input id="audit-to" class="inp" type="date" bind:value={toDay} />
		</div>
		<div class="frow">
			<label class="lab" for="audit-action">Acción</label>
			<select id="audit-action" class="inp" bind:value={action}>
				<option value="">(todas)</option>
				<option value="login">login</option>
				<option value="logout">logout</option>
				<option value="view_ip">view_ip</option>
				<option value="kick">kick</option>
				<option value="create_user">create_user</option>
				<option value="revoke_user">revoke_user</option>
				<option value="hide_revoked_user">hide_revoked_user</option>
				<option value="unhide_revoked_user">unhide_revoked_user</option>
				<option value="download_bundle">download_bundle</option>
			</select>
		</div>
		<div class="frow">
			<label class="lab" for="audit-cn">CN</label>
			<input id="audit-cn" class="inp" placeholder="ej: prueba" bind:value={cn} autocomplete="off" />
		</div>
		<div class="frow">
			<label class="lab" for="audit-ok">OK</label>
			<select id="audit-ok" class="inp" bind:value={ok}>
				<option value="">(todos)</option>
				<option value="1">solo OK</option>
				<option value="0">solo fallos</option>
			</select>
		</div>
		</div>
	</section>

	{#if needsAuth}
		<AuthGate message={error ?? undefined} nextPath="/audit" />
	{:else if error}
		<ErrorPanel title="No se pudo cargar la auditoría" detail={error} onRetry={() => load()} />
	{:else if loading}
		<section class="panel" aria-busy="true">
			<Skeleton height="18px" width="40%" />
			<div style="margin-top:12px"><Skeleton height="280px" /></div>
		</section>
	{:else}
		{#if rows.length >= limit && limit >= 50}
			<section class="panel panel--warn auditLimitHint">
				<strong>Resultado truncado</strong>
				<p class="muted">
					Estás viendo como máximo <span class="mono">{limit}</span> filas. Puede haber registros más antiguos no
					mostrados. Acota por fechas, sube el límite (máx. 1000) o exporta CSV/JSON.
				</p>
			</section>
		{/if}
		{#if rows.length === 0}
			<section class="panel panelEmpty" aria-live="polite">
				<p class="auditEmpty__title">No hay registros con estos filtros</p>
				<p class="muted">
					No se encontraron entradas de auditoría. Prueba a ampliar fechas, subir el límite, quitar filtros de
					acción/CN/OK o pulsar <strong>Limpiar filtros</strong>.
				</p>
			</section>
		{:else}
			<section class="panel">
				<div class="frow" style="margin-bottom:12px">
					<label class="lab" for="audit-table-q">Buscar en tabla</label>
					<input
						id="audit-table-q"
						class="inp"
						type="search"
						placeholder="acción, actor, CN, IP…"
						bind:value={tableSearch}
						oninput={() => (auditPage = 1)}
						autocomplete="off"
					/>
				</div>
				<div class="panelTableScroll">
					<table>
						<caption class="visually-hidden">Registros de auditoría</caption>
						<thead>
							<tr>
								<th scope="col">TS</th>
								<th scope="col">Acción</th>
								<th scope="col">CN</th>
								<th scope="col">OK</th>
								<th scope="col">IP</th>
								<th scope="col">Detalles</th>
							</tr>
						</thead>
						<tbody>
							{#each paged.page as r, idx (`${r.ts}|${idx}|${r.action}|${r.target_cn ?? ''}`)}
								<tr>
									<td class="mono">{r.ts}</td>
									<td>{r.action}</td>
									<td class="mono">{r.target_cn ?? '-'}</td>
									<td>{r.success ? 'sí' : 'no'}</td>
									<td class="mono">{r.remote_ip ?? '-'}</td>
									<td class="mono auditDetailCell">
										<span class="auditDetailPreview">{previewDetails(r.details)}</span>
										<button
											type="button"
											class="btn btnMini secondary auditDetailOpen"
											onclick={() => (detailModal = r)}
										>
											Ver JSON
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
				<TablePager bind:page={auditPage} total={paged.total} pageSize={AUDIT_PAGE_SIZE} />
			</section>
		{/if}
	{/if}

	{#if detailModal}
		<div
			class="auditModalBackdrop"
			role="presentation"
			onclick={() => (detailModal = null)}
			onkeydown={(e) => e.key === 'Escape' && (detailModal = null)}
		>
			<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="panel auditModal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="audit-detail-title"
				aria-describedby="audit-detail-desc"
				tabindex="-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<div class="auditModal__head">
					<div>
						<h2 id="audit-detail-title">Detalles del evento</h2>
						<p class="auditModal__meta mono">
							{detailModal.ts} · {detailModal.action} · CN {detailModal.target_cn ?? '—'}
						</p>
					</div>
					<button
						type="button"
						class="btn secondary auditModalClose"
						onclick={() => (detailModal = null)}
					>
						Cerrar
					</button>
				</div>
				<p id="audit-detail-desc" class="auditModal__desc">
					Contenido técnico completo (JSON) registrado para esta acción. Puedes desplazarte con el teclado dentro del
					bloque siguiente.
				</p>
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<div
					id="audit-detail-json"
					class="auditModalPre mono"
					role="region"
					aria-label="JSON del evento"
					tabindex="0"
				>
					<pre>{JSON.stringify(detailModal.details, null, 2)}</pre>
				</div>
			</div>
		</div>
	{/if}
</main>

