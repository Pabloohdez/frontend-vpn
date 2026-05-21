# Hoja de ruta — `mejoras_fronted-vpn.pdf`

Estado de las prácticas del PDF. Prioridad sugerida en el documento: **producción → backup → healthcheck → resiliencia upstream → APIs vacías → `.env` → caché → UX**.

| ID | Tarea | Prioridad | Estado |
|----|--------|-----------|--------|
| 1.1 | Producción (`docker-compose.prod.yml`, build Node) | Alta | Hecho |
| 1.2 | Healthcheck en compose | Alta | Hecho (`docker-compose.prod.yml`) |
| 1.3 | Caída VM1/Pi-hole + último estado | Media | Hecho (`upstream-last-known`, respuestas `stale`) |
| 1.4 | Backup diario `data/` | Alta | Script + `POST /api/cron/data-backup` |
| 1.5 | Redis opcional | Baja | Sin cambio (documentado en `.env.example`) |
| 2.1 | Caché llamadas VM1/Pi-hole | Media | Hecho (`upstream-cache.ts`, TTL por env) |
| 3.1 | Auto-refresco configurable | Media | Hecho (OpenVPN, `refresh-prefs.ts`) |
| 3.2 | Skeletons / errores claros | Baja | Parcial |
| 3.3 | Paginación/búsqueda tablas | Media | Parcial (auditoría con filtros) |
| 3.4 | Modo oscuro / responsive | Baja | Parcial (`ThemeToggle`, hub móvil) |
| 4.1 | APIs `cron/watchdog`, `admin/activity` | Media | Hecho |
| 4.2 | Export CSV auditoría | Baja | Hecho (`/api/admin/audit/export`) |
| 4.3 | Alertas email | Media | Solo UI (sin SMTP) |
| 4.4 | Dashboard unificado inicio | Baja | Hecho (`/api/admin/overview` + tarjeta inicio) |
| 5.1 | Unificar `timingSafeEqual` strings | Baja | Hecho (`crypto-utils.ts`) |
| 5.2 | Consolidar CSS | Baja | Pendiente |
| 5.3 | Más tests | Baja | Parcial |
| 6.x | Secretos `.env` | Media | Documentado; no tocar `.env` real en servidor |

## Cron recomendado (host)

```cron
# Backup diario 02:00
0 2 * * * curl -fsS -X POST -H "X-Cron-Secret: TU_SECRETO" http://127.0.0.1:2346/api/cron/data-backup

# Watchdog cada 5 min
*/5 * * * * curl -fsS -X POST -H "X-Cron-Secret: TU_SECRETO" http://127.0.0.1:2346/api/cron/watchdog
```

Variables en `.env`:

- `CRON_SECRET` — obligatorio para endpoints `/api/cron/*`
- `BACKUP_DEST_DIR` — opcional (default `./backups`)
- `UPSTREAM_CACHE_*_SEC` — TTL caché en memoria
- `UPSTREAM_LAST_KNOWN_PATH` — opcional (default `data/upstream-last-known.json`)

## Despliegue producción

```bash
sudo docker compose -f docker-compose.prod.yml up -d --build
```
