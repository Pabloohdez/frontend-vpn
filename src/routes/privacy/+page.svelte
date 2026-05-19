<script lang="ts">
	import './page.css';
</script>

<main class="pageWrap pageWide page-privacy" id="contenido-principal" tabindex="-1">
	<header class="panelHero">
		<div class="panelHero__text">
			<h1 class="panelHero__title">Privacidad y uso</h1>
			<p class="panelHero__sub">Documentación interna sobre datos tratados, finalidad y retención.</p>
		</div>
	</header>

	<section class="panel panel--readonly privacyIntro" aria-label="Aviso sobre este documento">
		<p class="privacyIntro__title">Documentación interna</p>
		<p class="muted">
			Este texto es una plantilla técnica para una VPN corporativa. Debe revisarse y adaptarse por vuestra empresa o
			asuntos legales antes de uso externo.
		</p>
	</section>

	<section class="panel privacyBody">
		<h2 class="panel__h2">Qué datos se tratan</h2>
		<ul>
			<li><span class="mono">Logs VPN</span>: CN/usuario, timestamps, IP (real y/o virtual), estado de conexión.</li>
			<li><span class="mono">Logs DNS (Pi-hole)</span>: dominios consultados, cliente (IP), timestamps, estado.</li>
			<li><span class="mono">Auditoría</span>: acciones de administración (login, expulsar, revocar, cambios en listas).</li>
		</ul>

		<h2 class="panel__h2">Finalidad</h2>
		<ul>
			<li>Seguridad de la red, detección de malware, respuesta a incidentes.</li>
			<li>Diagnóstico y soporte (resolución de problemas de conectividad/DNS).</li>
			<li>Control de cambios administrativos (trazabilidad).</li>
		</ul>

		<h2 class="panel__h2">Acceso</h2>
		<ul>
			<li>
				Administradores gestionan usuarios y listas; los auditores tienen el mismo acceso de lectura (DNS,
				auditoría, estado) sin modificar listas desde la interfaz.
			</li>
			<li>Se registran en auditoría los cambios sobre listas de Pi-hole.</li>
		</ul>

		<h2 class="panel__h2">Retención (configurable)</h2>
		<ul>
			<li><span class="mono">AUDIT_RETENTION_DAYS</span>: retención del fichero de auditoría (por defecto 90 días).</li>
			<li><span class="mono">VPN_IPCN_TTL_DAYS</span>: TTL del histórico IP virtual → CN (por defecto 30 días).</li>
			<li>Los logs DNS dependen de Pi-hole (configurar su retención en Pi-hole/FTL).</li>
		</ul>

		<h2 class="panel__h2">Contacto</h2>
		<p>
			Para ejercer derechos o consultas internas, contacta con el responsable de sistemas o DPO/asesoría legal de la
			empresa.
		</p>
	</section>
</main>
