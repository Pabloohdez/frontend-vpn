<script lang="ts">
	import './launcher.css';
	import ThemeToggle from '$lib/ThemeToggle.svelte';
</script>

<main class="launcher" id="contenido-principal" tabindex="-1">
	<header class="launcher__top">
		<span class="launcher__brand">Panel VPN</span>
		<div class="launcher__topActions">
			<ThemeToggle />
			<a href="/ajustes" class="launcher__settings" title="Ajustes" aria-label="Ajustes">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
					<circle cx="12" cy="12" r="3" />
					<path
						d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"
					/>
				</svg>
			</a>
		</div>
	</header>

	<div class="launcher__body">
		<h1 class="launcher__title">¿Qué quieres gestionar?</h1>
		<p class="launcher__sub muted">Elige un módulo para ver su panel y opciones.</p>

		<div class="launcher__cards" role="navigation" aria-label="Módulos del panel">
			<a href="/openvpn" class="launcher__card launcher__card--vpn">
				<span class="launcher__cardLabel">OpenVPN</span>
				<span class="launcher__cardHint muted">Clientes, usuarios y estado VM1</span>
			</a>
			<a href="/pihole" class="launcher__card launcher__card--dns">
				<span class="launcher__cardLabel">Pi-hole</span>
				<span class="launcher__cardHint muted">DNS, listas y seguridad</span>
			</a>
			<a href="/audit" class="launcher__card launcher__card--audit">
				<span class="launcher__cardLabel">Auditoría</span>
				<span class="launcher__cardHint muted">Registro de acciones administrativas</span>
			</a>
		</div>
	</div>
</main>
