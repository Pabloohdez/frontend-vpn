# Hoja de ruta — `mejoras_fronted-vpn.pdf`

Estado del PDF (mayo 2026). Casi todo el documento está cubierto en código.

| ID | Tarea | Prioridad | Estado |
|----|--------|-----------|--------|
| 1.1 | Producción (`docker-compose.prod.yml`) | Alta | ✅ |
| 1.2 | Healthcheck en compose | Alta | ✅ |
| 1.3 | Caída VM1/Pi-hole + último estado | Media | ✅ |
| 1.4 | Backup diario `data/` | Alta | ✅ API + script |
| 1.5 | Redis opcional | Baja | ✅ Documentado [`REDIS.md`](./REDIS.md) |
| 2.1 | Caché VM1/Pi-hole | Media | ✅ |
| 3.1 | Auto-refresco configurable | Media | ✅ OpenVPN, Pi-hole, Seguridad, **DNS** |
| 3.2 | Skeletons / errores claros | Baja | ✅ |
| 3.3 | Paginación/búsqueda tablas | Media | ✅ Auditoría, DNS, **Usuarios VPN**, Seguridad (anomalías/sospechas); bloqueos con pager |
| 3.4 | Modo oscuro / responsive | Baja | ✅ |
| 4.1 | APIs cron / activity | Media | ✅ `activity`, cron DNS histórico, watchdog, backup |
| 4.2 | Export CSV / Excel | Baja | ✅ Auditoría (CSV/Excel servidor hasta 5000 + tabla filtrada) + DNS (CSV/Excel filtrados) |
| 4.3 | Alertas email (incl. DNS) | Media | ✅ SMTP; cron incluye anomalías DNS y tunelización |
| 4.4 | Dashboard unificado | Baja | ✅ Overview en inicio + tarjeta Dashboard |
| 4.5 | Histórico DNS + patrones | — | ✅ (extra) `dns-hourly-history`, predicción |
| 5.1 | `timingSafeEqual` unificado | Baja | ✅ |
| 5.2 | Consolidar CSS | Baja | ✅ `panel-ui.css` |
| 5.3 | Tests login / permisos / env | Baja | ✅ `auth.test`, `permissions`, `env-security` |
| 6.x | Avisos `.env` en panel | Media | ✅ `getEnvSecurityWarnings()` en overview (admin) |

## Correo (§4.3)

Variables en `.env`:

```env
SMTP_HOST=smtp.ejemplo.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=usuario
SMTP_PASS=contraseña
ALERT_EMAIL_FROM=panel@ejemplo.com
ALERT_EMAIL_TO=admin@ejemplo.com,ops@ejemplo.com
ALERT_EMAIL_COOLDOWN_MIN=30
ALERT_EMAIL_SECURITY=true
```

- **Watchdog** — email si VM1 o Pi-hole caen.
- **Seguridad** — email si hay alertas **críticas** (logins, Pi-hole caído, **actividad DNS inusual**, tunelización).
- **Prueba** — Ajustes → Alertas por correo.

## Histórico DNS y predicción

- `data/dns-hourly-history.json` — retención `DNS_HISTORY_RETENTION_DAYS` (default 120).
- `POST /api/cron/dns-history` cada hora.
- Dashboard → «Patrones y predicción DNS».
- `GET /api/admin/dns/history?days=90`

## Cron recomendado

```cron
0 2 * * * curl -fsS -X POST -H "X-Cron-Secret: SECRETO" http://127.0.0.1:2346/api/cron/data-backup
*/5 * * * * curl -fsS -X POST -H "X-Cron-Secret: SECRETO" http://127.0.0.1:2346/api/cron/watchdog
0 * * * * curl -fsS -X POST -H "X-Cron-Secret: SECRETO" http://127.0.0.1:2346/api/cron/security-alerts
5 * * * * curl -fsS -X POST -H "X-Cron-Secret: SECRETO" "http://127.0.0.1:2346/api/cron/dns-history?max_hours=48"
```

## Secretos (§6) — en el servidor

El inicio muestra avisos si falta `MASTER_KEY`, `SESSION_SECRET` es corto, etc. Generar secretos:

```bash
openssl rand -hex 32   # SESSION_SECRET y MASTER_KEY
```

PBKDF2 admin: ver `.env.example`.

## Despliegue

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
```

## Pendiente opcional (fuera del PDF o muy bajo impacto)

- Quitar Redis del código por completo (§1.5 recomienda simplificar; hoy está documentado como opcional en [`REDIS.md`](./REDIS.md)).
- Export `.xlsx` nativo (hoy `.xls` SpreadsheetML vía `?format=xls` y botones Excel en UI).
- Homogeneizar estilo `panel*` en Ajustes / Pi-hole hub / Privacidad (cosmético).
