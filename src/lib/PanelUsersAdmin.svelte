<script lang="ts">
	import { onMount } from 'svelte';
	import { csrfHeaders } from '$lib/csrf-client';
	import { apiErrorMessage } from '$lib/api-errors';

	type PanelUserRow = {
		id: string;
		username: string;
		role: 'admin' | 'operator' | 'auditor';
		enabled: boolean;
		created_at: string;
		updated_at: string;
	};

	let users = $state<PanelUserRow[]>([]);
	let loading = $state(true);
	let err = $state<string | null>(null);
	let okMsg = $state<string | null>(null);
	let busy = $state(false);

	let newUsername = $state('');
	let newPassword = $state('');
	let newRole = $state<'admin' | 'operator' | 'auditor'>('operator');

	const roleLabels: Record<PanelUserRow['role'], string> = {
		admin: 'Administrador',
		operator: 'Operador',
		auditor: 'Auditor (solo lectura)'
	};

	async function load() {
		loading = true;
		err = null;
		const res = await fetch('/api/admin/panel-users', { headers: { 'cache-control': 'no-cache' } });
		const j = await res.json().catch(() => null);
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo cargar los usuarios del panel.');
			users = [];
			loading = false;
			return;
		}
		users = j?.users ?? [];
		loading = false;
	}

	async function createUser() {
		if (busy) return;
		busy = true;
		err = null;
		okMsg = null;
		const res = await fetch('/api/admin/panel-users', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({
				username: newUsername.trim(),
				password: newPassword,
				role: newRole
			})
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo crear el usuario.');
			return;
		}
		newUsername = '';
		newPassword = '';
		okMsg = `Usuario «${j.user?.username ?? ''}» creado. Ya puede iniciar sesión con ese nombre y contraseña.`;
		await load();
	}

	async function toggleEnabled(u: PanelUserRow) {
		if (busy) return;
		busy = true;
		err = null;
		okMsg = null;
		const res = await fetch('/api/admin/panel-users', {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({ id: u.id, enabled: !u.enabled })
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo actualizar el usuario.');
			return;
		}
		await load();
	}

	async function resetPassword(u: PanelUserRow) {
		const pw = prompt(`Nueva contraseña para «${u.username}» (mín. 8 caracteres):`);
		if (pw === null) return;
		if (pw.length < 8) {
			err = 'La contraseña debe tener al menos 8 caracteres.';
			return;
		}
		busy = true;
		err = null;
		const res = await fetch('/api/admin/panel-users', {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({ id: u.id, password: pw })
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo cambiar la contraseña.');
			return;
		}
		okMsg = `Contraseña actualizada para «${u.username}».`;
	}

	async function changeRole(u: PanelUserRow) {
		const next = prompt(
			`Nuevo rol para «${u.username}»: admin | operator | auditor`,
			u.role
		);
		if (!next) return;
		const role = next.trim().toLowerCase();
		if (role !== 'admin' && role !== 'operator' && role !== 'auditor') {
			err = 'Rol inválido';
			return;
		}
		busy = true;
		err = null;
		const res = await fetch('/api/admin/panel-users', {
			method: 'PUT',
			headers: { 'content-type': 'application/json', ...csrfHeaders() },
			body: JSON.stringify({ id: u.id, role })
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo cambiar el rol.');
			return;
		}
		await load();
	}

	async function removeUser(u: PanelUserRow) {
		if (!confirm(`¿Eliminar el usuario «${u.username}»? No podrá volver a entrar.`)) return;
		busy = true;
		err = null;
		const res = await fetch(`/api/admin/panel-users?id=${encodeURIComponent(u.id)}`, {
			method: 'DELETE',
			headers: { ...csrfHeaders() }
		});
		const j = await res.json().catch(() => null);
		busy = false;
		if (!res.ok) {
			err = apiErrorMessage(res.status, j, 'No se pudo eliminar.');
			return;
		}
		okMsg = `Usuario «${u.username}» eliminado.`;
		await load();
	}

	onMount(load);
</script>

<section class="panel panelUsers" aria-label="Usuarios del panel">
	<h2 class="panel__h2">Usuarios del panel</h2>
	<p class="muted settingsNote">
		Crea cuentas con <strong>usuario + contraseña + rol</strong>. Se guardan en
		<code class="mono">data/panel-users.json</code> (hash, nunca en claro). Las cuentas del
		<code class="mono">.env</code> (<code class="mono">admin</code>, <code class="mono">auditor</code>,
		<code class="mono">operator</code>) siguen funcionando como respaldo.
	</p>

	<form
		class="panelUsers__form"
		onsubmit={(e) => {
			e.preventDefault();
			createUser();
		}}
	>
		<h3 class="panelUsers__h3">Nuevo usuario</h3>
		<div class="panelUsers__grid">
			<label class="panelUsers__field">
				<span class="muted">Usuario</span>
				<input class="input" bind:value={newUsername} placeholder="ej. maria.ops" required minlength="3" />
			</label>
			<label class="panelUsers__field">
				<span class="muted">Contraseña</span>
				<input
					class="input"
					type="password"
					bind:value={newPassword}
					placeholder="mín. 8 caracteres"
					required
					minlength="8"
					autocomplete="new-password"
				/>
			</label>
			<label class="panelUsers__field">
				<span class="muted">Rol</span>
				<select class="input" bind:value={newRole}>
					<option value="admin">Administrador</option>
					<option value="operator">Operador</option>
					<option value="auditor">Auditor</option>
				</select>
			</label>
		</div>
		<button type="submit" class="btn btnAccent" disabled={busy || !newUsername.trim() || newPassword.length < 8}>
			{busy ? 'Guardando…' : 'Crear usuario'}
		</button>
	</form>

	{#if okMsg}
		<p class="panelUsers__ok" role="status">{okMsg}</p>
	{/if}
	{#if err}
		<p class="settingsErr" role="alert">{err}</p>
	{/if}

	<h3 class="panelUsers__h3">Cuentas activas</h3>
	{#if loading}
		<p class="muted">Cargando…</p>
	{:else if users.length === 0}
		<p class="muted">No hay usuarios creados desde el panel. Puedes seguir usando las contraseñas del <code class="mono">.env</code>.</p>
	{:else}
		<ul class="panelUsers__list">
			{#each users as u (u.id)}
				<li class="panelUsers__item" class:panelUsers__item--off={!u.enabled}>
					<div class="panelUsers__main">
						<strong class="mono">{u.username}</strong>
						<span class="panelUsers__role">{roleLabels[u.role]}</span>
						<span class="muted panelUsers__meta">
							{u.enabled ? 'Activo' : 'Desactivado'} · creado {u.created_at.slice(0, 10)}
						</span>
					</div>
					<div class="panelUsers__actions">
						<button type="button" class="btn btnMini secondary" disabled={busy} onclick={() => resetPassword(u)}>
							Nueva contraseña
						</button>
						<button type="button" class="btn btnMini secondary" disabled={busy} onclick={() => changeRole(u)}>
							Cambiar rol
						</button>
						<button type="button" class="btn btnMini secondary" disabled={busy} onclick={() => toggleEnabled(u)}>
							{u.enabled ? 'Desactivar' : 'Activar'}
						</button>
						<button type="button" class="btn btnMini btnGhost" disabled={busy} onclick={() => removeUser(u)}>
							Eliminar
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.panelUsers__form {
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--border-subtle);
	}
	.panelUsers__h3 {
		margin: 0 0 10px;
		font-size: 14px;
		font-weight: 650;
	}
	.panelUsers__grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
		gap: 10px;
		margin-bottom: 10px;
	}
	.panelUsers__field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 13px;
	}
	.panelUsers__ok {
		margin: 0 0 10px;
		font-size: 13px;
		color: var(--ok, #0d9488);
	}
	.panelUsers__list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.panelUsers__item {
		display: flex;
		flex-wrap: wrap;
		justify-content: space-between;
		gap: 10px;
		padding: 12px;
		border: 1px solid var(--border-subtle);
		border-radius: 10px;
		align-items: center;
	}
	.panelUsers__item--off {
		opacity: 0.55;
	}
	.panelUsers__main {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.panelUsers__role {
		font-size: 13px;
	}
	.panelUsers__meta {
		font-size: 12px;
	}
	.panelUsers__actions {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
</style>
