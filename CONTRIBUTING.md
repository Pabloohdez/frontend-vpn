# Contribuir al Panel VPN

¡Gracias por querer mejorar este proyecto! Esta guía es deliberadamente corta:
si echas en falta algo, abre un issue.

## Requisitos

- **Node.js** ≥ 22 (LTS recomendado)
- **npm** ≥ 10 (viene con Node 22)
- **Docker** + **docker-compose** (solo para entorno de desarrollo aislado)

## Puesta en marcha

```bash
git clone https://github.com/Pabloohdez/frontend-vpn.git
cd frontend-vpn
cp .env.example .env       # rellena valores reales (NO subir .env a git)
npm install
npm run dev                # http://localhost:5173
```

## Estilo de código

- **TypeScript estricto** (`strict: true`). Evita `any`; si lo necesitas,
  comenta por qué.
- **Componentes Svelte 5** con runes (`$state`, `$derived`, `$effect`). No uses
  stores `writable/readable` salvo que la dependencia los exija.
- **CSS scoped** en `<style>` de cada componente. Para tokens y utilidades
  globales, usa `src/lib/panel-ui.css`.
- Server-only modules en `src/lib/server/...`. Nunca importes módulos `server`
  desde un `.svelte` que se hidrate en cliente.
- Logs sensibles (tokens, IPs reales): usa los helpers de `src/lib/server/log.ts`
  y nunca los serialices al cliente.

## Antes de enviar un PR

```bash
npm run check       # TypeScript + svelte-check (debe pasar sin errores)
npm run test        # Tests unitarios (vitest)
npm run build       # Build de producción (debe completarse)
```

Estos tres pasos también los ejecuta GitHub Actions en cada PR.

## Estructura

```
src/
├── lib/
│   ├── server/        # Sólo importable desde +server.ts / +layout.server.ts
│   ├── *.svelte       # Componentes reutilizables
│   └── *.ts           # Utilidades cliente o cliente+servidor
├── routes/            # SvelteKit
│   ├── api/           # Endpoints REST (proxy hacia OpenVPN/Pi-hole)
│   └── (páginas)
├── hooks.server.ts    # Headers de seguridad globales
└── app.html / app.d.ts
```

## Cómo proponer un cambio grande

1. Abre un **issue** describiendo el problema antes de codear.
2. Espera feedback (24-72 h) para alinear el enfoque.
3. Crea una rama `feat/...` o `fix/...` desde `main`.
4. Mantén los PRs **pequeños y enfocados**: un cambio = un PR.

## Seguridad

Lee [`SECURITY.md`](./SECURITY.md). En resumen:

- **Nunca** commitees `.env`, `data/`, PDFs ni datos reales (IPs, MACs, CNs).
- Si descubres un fallo de seguridad, **no abras issue público**; contacta al
  mantenedor por correo (perfil de GitHub).

## Convención de commits

Recomendado (no obligatorio): [Conventional Commits](https://www.conventionalcommits.org/).

Ejemplos:

```
feat(dns): añadir filtros guardados en localStorage
fix(pihole): manejar respuestas v6 sin `data` en /api/lists
docs(readme): añadir capturas
refactor(audit): extraer helper de paginación
```

## Licencia

Al contribuir aceptas que tu código quede bajo la licencia **MIT** del proyecto.
