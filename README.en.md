<div align="center">

# Panel VPN

Unified web dashboard to manage **OpenVPN + Pi-hole + LAN inventory** from a
single place, with auditing, per-device control and exportable PDF reports.

[![CI](https://img.shields.io/badge/CI-GitHub_Actions-2088FF?logo=githubactions&logoColor=white)](./.github/workflows/ci.yml)
[![SvelteKit](https://img.shields.io/badge/SvelteKit-2-FF3E00?logo=svelte&logoColor=white)](https://kit.svelte.dev)
[![Svelte](https://img.shields.io/badge/Svelte-5-FF3E00?logo=svelte&logoColor=white)](https://svelte.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](./docker-compose.prod.yml)
[![License](https://img.shields.io/badge/license-MIT-green)](#license)

[Español](./README.md) · **English**

</div>

---

## Why does it exist?

Managing a **corporate OpenVPN + Pi-hole** setup typically requires:

- SSH into the OpenVPN host to create/revoke users and download `.ovpn` bundles.
- A separate Pi-hole admin page that doesn't tell you **which device** ran a
  specific DNS query, nor cross-references it with the VPN client or LAN
  inventory.
- Manual SQL queries to `pihole-FTL.db` when somebody asks *"what did device X
  visit yesterday?"*.
- No audit trail of admin actions.
- No easy way to **cut internet for a single device** without touching Pi-hole
  groups by hand.

This panel solves all of that with **one unified UI**, never exposing tokens or
internal endpoints to the browser: everything is proxied server-side with
signed session cookies and role-based access control.

## What it does

- Create, rename, **revoke** and download `.ovpn` bundles for VPN users in two
  clicks.
- Real-time OpenVPN client list: CN, virtual IP, real IP, site, duration,
  traffic, kick.
- **Pi-hole**: live DNS queries, lists (allow/deny, exact or wildcard), block
  or restore internet **per device** (not per group) via Pi-hole v6.
- **Device ↔ IP ↔ CN ↔ DNS correlation**: every DNS query is enriched with the
  device name from the LAN inventory and the active VPN certificate, instead
  of an anonymous IP.
- Full **audit log** (JSONL) of every admin action, with configurable alerts
  (e.g. number of failed logins in a window).
- **Professional per-day, per-device PDF reports** with cover, index, top
  domains and detailed query log.
- Security dashboard: top blocked domains, devices with most blocks, anomalies.

## Stack

| Layer | Tech |
|-------|------|
| Framework | [SvelteKit 2](https://kit.svelte.dev) on [Svelte 5](https://svelte.dev) with **runes** (`$state`, `$derived`) |
| Language | [TypeScript 6](https://www.typescriptlang.org) (strict mode) |
| Build / dev | [Vite 8](https://vitejs.dev), HMR and SSR |
| Server runtime | Node.js LTS via [`@sveltejs/adapter-node`](https://kit.svelte.dev/docs/adapter-node) |
| Styling | Native CSS with tokens + in-house design system (`src/lib/panel-ui.css`) |
| PDF | [PDFKit](https://pdfkit.org/) for reports with cover, index and tables |
| Tests | [Vitest 3](https://vitest.dev) |
| Quality | `svelte-check`, type-check in CI |
| Containers | Docker + `docker-compose` (dev & prod profiles) |
| CI | GitHub Actions (`check`, `test`, `build`) |
| Integrations | OpenVPN (custom REST API), Pi-hole v5/v6, netmonitor (optional) |

## Quick start

```bash
cp .env.example .env       # fill in real values (NEVER commit .env)
npm install
npm run dev                # http://localhost:5173
```

Docker (production):

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Default URL: **http://&lt;HOST_IP&gt;:2346**

## Configuration (`.env`)

| Variable | Purpose |
|----------|---------|
| `VPN_API_BASE_URL` | Private URL of the OpenVPN API |
| `VPN_API_KEY` | API key for the OpenVPN service |
| `SESSION_SECRET` | Signed session cookie (≥32 random chars) |
| `ADMIN_PASSWORD` *or* `ADMIN_PASSWORD_PBKDF2` | Panel administrator |
| `AUDITOR_PASSWORD` *or* `AUDITOR_PASSWORD_PBKDF2` | Optional read-only role |
| `PIHOLE_BASE_URL` | Private Pi-hole URL |
| `PIHOLE_API_TOKEN` | v5 token or v6 application password |
| `PIHOLE_FALLBACK_URL` | Optional fallback Pi-hole URL |
| `NETMONITOR_BASE_URL` / `NETMONITOR_API_KEY` | Optional LAN inventory |
| `AUDIT_DB_PATH` | JSONL path for the audit log |

> All hosts/IPs are **private** and injected via environment variables. No
> infrastructure value is hardcoded in the code.

Generate strong secrets:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Roles

- **Admin** — full control: VPN users, Pi-hole lists, per-device DNS blocking,
  kick sessions, revoke certificates, export reports.
- **Auditor** — extended read-only: DNS, audit, status, dashboard; cannot
  modify lists or cut internet.

## Architecture

```
                        ┌────────────────────┐
                        │  Browser (HTTPS)   │
                        └──────────┬─────────┘
                                   │ signed session cookies
                                   ▼
                  ┌────────────────────────────────┐
                  │  SvelteKit (this panel)        │
                  │  + auth + audit + PDFKit       │
                  └────────────┬───────────────────┘
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
  │ OpenVPN API      │ │ Pi-hole API v5/6 │ │ netmonitor       │
  │ (private host)   │ │ (private host)   │ │ (optional)       │
  └──────────────────┘ └──────────────────┘ └──────────────────┘
```

Credentials and internal endpoints **live only on the server**; the browser
only talks to `/api/...` on the panel.

## Security

- `.env`, `data/`, `*.pdf`, `*.csv`, `*.jsonl` are excluded by `.gitignore`.
- Session cookies are signed and rotate when `SESSION_SECRET` changes.
- Passwords can be stored as **PBKDF2** (`saltHex:iters:keyHex`, SHA-256,
  ≥100,000 iterations).
- Every admin action is recorded in the JSONL audit log.
- Strict Content Security Policy (managed by SvelteKit hashes), HSTS,
  cross-origin isolation headers, `Permissions-Policy` lockdown.

For vulnerability reports, read [`SECURITY.md`](./SECURITY.md) and do **not**
open a public issue.

## License

MIT — use, modify and redistribute freely as long as you keep the copyright
notice. Your organization's data is **yours** and this repo never contains it
(see `.gitignore` and `SECURITY.md`).
