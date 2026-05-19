<div align="center">

# Panel VPN

Panel web unificado para administrar **OpenVPN + Pi-hole + inventario de red**
desde un único punto, con auditoría, control por dispositivo e informes
exportables.

[![CI](https://github.com/Pabloohdez/frontend-vpn/actions/workflows/ci.yml/badge.svg)](https://github.com/Pabloohdez/frontend-vpn/actions/workflows/ci.yml)
[![Node](https://img.shields.io/badge/node-%3E%3D22-339933?logo=node.js&logoColor=white)](./package.json)
[![Playwright](https://img.shields.io/badge/e2e-Playwright-2EAD33?logo=playwright&logoColor=white)](./tests/e2e)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./docker-compose.prod.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](#licencia)

**Español** · [English](./README.en.md)

</div>

---

## ¿Qué problema resuelve?

Cuando gestionas una **VPN corporativa con OpenVPN y Pi-hole** acaban surgiendo
los mismos dolores de cabeza:

- Para **dar de alta/baja un usuario** tienes que entrar por SSH al host de
  OpenVPN, generar el certificado, copiarle el `.ovpn` por algún canal seguro
  y, si te equivocas, repetir.
- **No sabes quién está conectado** ahora mismo, ni con qué IP virtual, ni
  desde qué IP real, ni cuánto lleva.
- **Pi-hole bloquea dominios** pero su panel propio no te dice qué
  *dispositivo concreto* de tu empresa hizo cada consulta DNS, ni cruza esa
  consulta con el certificado VPN o con el inventario de equipos.
- Si quieres **cortar el tráfico de un equipo** (por ejemplo, móvil de un
  empleado que se va) hay que tocar Pi-hole a mano (grupos, regex, etc.).
- **No hay traza de quién hizo qué** en la administración (logins, expulsiones,
  añadir/quitar listas, exportar datos…).
- Cuando RRHH/dirección pide *"dame las webs que ha visitado el portátil X
  ayer"* tienes que improvisar un script con `pihole-FTL.db` y SQL.

Este panel resuelve todo lo anterior con **una sola UI**, sin exponer en el
navegador ni los tokens ni los endpoints internos: todo va proxyado desde el
servidor de SvelteKit con cookies de sesión firmadas y control de roles.

## ¿Para qué sirve?

- Crear, renombrar, **revocar** y **descargar bundles `.ovpn`** de usuarios VPN
  con un par de clics.
- Ver clientes OpenVPN **en tiempo real**: CN, IP virtual, IP real, sede,
  duración, tráfico, kick.
- **Pi-hole**: ver consultas DNS en vivo, listas (negras/blancas, exactas o
  wildcard), añadir/quitar dominios, y **bloquear o restaurar internet por
  dispositivo** (no por todo el grupo) usando Pi-hole v6.
- **Correlación dispositivo ↔ IP ↔ CN ↔ DNS**: una IP de Pi-hole se cruza con
  el inventario de red (netmonitor) y con la sesión OpenVPN activa, para que
  cada consulta DNS lleve **nombre de equipo + usuario VPN**, no solo una IP
  anónima.
- **Auditoría completa** (JSONL) de todas las acciones administrativas con
  alertas configurables (p. ej. nº de logins fallidos en una ventana).
- **Informe PDF profesional por día y dispositivo** con portada, índice,
  top dominios y detalle de consultas, listo para imprimir o entregar.
- Dashboard de **seguridad**: top dominios bloqueados, dispositivos con más
  intentos, anomalías.

## Stack

| Capa | Tecnología |
|------|------------|
| Framework | [SvelteKit 2](https://kit.svelte.dev) sobre [Svelte 5](https://svelte.dev) con **runes** (`$state`, `$derived`) |
| Lenguaje | [TypeScript 6](https://www.typescriptlang.org) en modo estricto |
| Build / dev | [Vite 8](https://vitejs.dev), HMR y SSR |
| Runtime servidor | Node.js LTS con [`@sveltejs/adapter-node`](https://kit.svelte.dev/docs/adapter-node) |
| Estilos | CSS nativo con tokens y *design system* propio (`src/lib/panel-ui.css`) |
| PDF | [PDFKit](https://pdfkit.org/) para informes con portada, índice y tablas |
| Tests | [Vitest 3](https://vitest.dev) |
| Calidad | `svelte-check`, type-check en CI |
| Contenedores | Docker + `docker-compose` (perfiles dev y prod) |
| CI | GitHub Actions (`check`, `test`, `build`) |
| Integraciones | OpenVPN (API REST propia), Pi-hole v5/v6, netmonitor (opcional) |

## Capturas

> Las capturas reales **no** se incluyen en el repo público (para no filtrar
> IPs, dominios o usuarios). Si despliegas el panel y quieres añadir las
> tuyas, guarda los archivos en [`docs/screenshots/`](./docs/screenshots/)
> siguiendo la convención de nombres descrita allí y se mostrarán aquí
> automáticamente.

<!--
  | ![Inicio](./docs/screenshots/01-home.png) | ![DNS](./docs/screenshots/02-dns.png) |
  |---|---|
  | Pantalla de inicio | Consultas DNS en vivo |
-->

```
/  →  Inicio                /pihole/listas      → Listas permitir/bloquear
/openvpn → Clientes VPN     /pihole/bloqueos    → Cortar internet por IP
/users   → Usuarios VPN     /dns                → Consultas DNS en vivo
/status  → Estado servicios /seguridad          → Métricas / tops
/pihole  → Resumen Pi-hole  /audit              → Auditoría
```

## Inicio rápido

### Modo local (sin Docker)

```bash
cp .env.example .env       # rellena tus valores reales (NO subir .env a git)
npm install
npm run dev                # http://localhost:5173
npm run build              # build de producción
node build                 # ejecuta el build
```

### Docker en desarrollo (Vite con HMR)

```bash
docker compose up -d
docker compose logs -f
```

### Docker en producción (build optimizado)

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose logs -f fronted-vpn
```

Healthcheck rápido:

```bash
npm run smoke:health
```

Acceso por defecto: **http://&lt;IP_DEL_HOST&gt;:2346**

## Configuración (`.env`)

Copia `.env.example` y configura, al menos:

| Variable | Uso |
|----------|-----|
| `VPN_API_BASE_URL` | URL privada de la API de OpenVPN |
| `VPN_API_KEY` | Clave de esa API |
| `SESSION_SECRET` | Cookie de sesión (≥32 caracteres aleatorios) |
| `ADMIN_PASSWORD` *o* `ADMIN_PASSWORD_PBKDF2` | Administrador del panel |
| `AUDITOR_PASSWORD` *o* `AUDITOR_PASSWORD_PBKDF2` | Opcional: solo lectura ampliada |
| `PIHOLE_BASE_URL` | URL privada de Pi-hole |
| `PIHOLE_API_TOKEN` | Token v5 o contraseña de aplicación v6 |
| `PIHOLE_FALLBACK_URL` | Opcional: URL alternativa de Pi-hole |
| `NETMONITOR_BASE_URL` / `NETMONITOR_API_KEY` | Opcional: inventario LAN |
| `AUDIT_DB_PATH` | Ruta del JSONL de auditoría |

> Todos los hosts/IPs son **privados** y se inyectan por entorno. Ningún valor
> de tu infraestructura queda hardcoded en el código.

Genera secretos fuertes con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Roles

- **Administrador** — gestión completa: usuarios VPN, listas Pi-hole, bloqueo
  DNS por dispositivo, expulsar sesión, revocar certificado, exportar informes.
- **Auditor** — solo lectura ampliada: DNS, auditoría, estado, dashboard;
  no puede modificar listas ni cortar internet.

## Arquitectura

```
                        ┌────────────────────┐
                        │  Navegador (HTTPS) │
                        └──────────┬─────────┘
                                   │ cookies de sesión firmadas
                                   ▼
                  ┌────────────────────────────────┐
                  │  SvelteKit (este panel)        │
                  │  + auth + auditoría + PDFKit   │
                  └────────────┬───────────────────┘
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ API OpenVPN      │ │ Pi-hole API v5/6 │ │ netmonitor       │
  │ (host privado)   │ │ (host privado)   │ │ (opcional)       │
  └──────────────────┘ └──────────────────┘ └──────────────────┘
```

Las credenciales y endpoints internos **viven solo en el servidor**; el
navegador habla únicamente con `/api/...` del panel.

## Estructura del proyecto

```
src/
├── lib/
│   ├── server/              # lógica de servidor: auth, pihole, vpn, pdf, audit
│   ├── *.svelte             # componentes UI reutilizables
│   └── panel-ui.css         # design system común
├── routes/
│   ├── (rutas públicas/de panel)
│   └── api/                 # endpoints proxy hacia OpenVPN/Pi-hole/...
└── app.html / app.d.ts

integrations/netmonitor/     # API interna opcional para inventario LAN
scripts/                     # smoke tests, backup, utilidades
.github/workflows/ci.yml     # CI: check + test + build
docker-compose.yml           # dev
docker-compose.prod.yml      # producción
Dockerfile                   # build de producción
```

## Desarrollo

```bash
npm run check        # TypeScript + svelte-check
npm run test         # tests unitarios (vitest)
npm run test:watch   # tests en modo watch
npm run build        # build de producción
npm run smoke:health # GET /api/health contra el servidor en marcha
```

## CI

En cada push / PR a `main` o `master`, **GitHub Actions** ejecuta
`npm run check`, `npm run test` y `npm run build`
(ver [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)).

## Despliegue en producción

1. Genera contraseñas fuertes o hashes PBKDF2 (ver `.env.example`).
2. Pon el panel detrás de un proxy TLS (Caddy / Traefik / Nginx) con
   `COOKIE_SECURE=true` y `TRUST_PROXY=true`.
3. Persiste `data/` con un volumen Docker:
   `./data:/app/data` (auditoría, historial IP↔CN, bloqueos…).
4. Comprueba la conectividad del contenedor con OpenVPN, Pi-hole y netmonitor.
5. Restringe el acceso al panel por firewall a la VLAN de administración.
6. Lee [`SECURITY.md`](./SECURITY.md) antes de hacer el primer push público.

## Seguridad

- `.env`, `data/`, `*.pdf`, `*.csv`, `*.jsonl` quedan fuera del repo por
  [`.gitignore`](./.gitignore).
- Las cookies de sesión van firmadas y se rotan al cambiar `SESSION_SECRET`.
- Las contraseñas se pueden almacenar como **PBKDF2** (`saltHex:iters:keyHex`,
  SHA-256, ≥100 000 iteraciones).
- Cada acción administrativa queda en el log JSONL de auditoría.

Si encuentras un fallo de seguridad, **no abras issue público**: lee la
política completa en [`SECURITY.md`](./SECURITY.md).

## Licencia

MIT — puedes usar, modificar y redistribuir el código libremente siempre que
conserves el aviso de copyright. Las credenciales y datos de tu organización
son **tuyos** y este repo no incluye ninguno (ver `.gitignore` y `SECURITY.md`).

## Créditos

Construido con [SvelteKit](https://kit.svelte.dev), [Svelte 5](https://svelte.dev),
[Vite](https://vitejs.dev), [PDFKit](https://pdfkit.org/) y
[Vitest](https://vitest.dev).
