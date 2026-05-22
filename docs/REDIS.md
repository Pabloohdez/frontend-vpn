# Redis en fronted-vpn (PDF §1.5)

## Decisión recomendada

| Escenario | Recomendación |
|-----------|----------------|
| Un solo admin, LAN, pocos logins | **Sin Redis** — cookie `admin_session` 12 h (`src/lib/server/auth.ts`). |
| Varios usuarios, sesiones cortas, lockout fiable | **Con Redis** — `REDIS_URL` en `.env`. |

El panel funciona **sin Redis**. Si defines `REDIS_URL`, se usan:

- Sesiones access ~15 min + refresh ~30 días (`session-store.ts`)
- Rate limit y lockout de login más consistentes entre reinicios del contenedor

## Cómo activarlo

```env
REDIS_URL=redis://:TU_PASSWORD@127.0.0.1:6379/0
```

En Docker con `network_mode: host`, apunta al Redis del host o de otro contenedor en la misma máquina.

## No hace falta Redis para

- Backup, watchdog, caché upstream (memoria + ficheros en `data/`)
- Auditoría, políticas, categorías (JSON en `data/`)

## Quitar referencias

Si no vas a usar Redis, deja `REDIS_URL` sin definir. No borres el paquete `redis` del proyecto: el código detecta ausencia y usa el modo cookie.
