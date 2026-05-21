# Checklist de seguridad — Panel VPN (fronted-vpn)

Estado orientativo del código en el repositorio. **Parcial** = implementado con límites; **No** = no está en el panel o depende solo de infraestructura.

Leyenda: ✅ Hecho · ⚠️ Parcial · ❌ No / no aplica

---

## Autenticación y autorización

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| 2FA TOTP para administradores | ✅ | `src/lib/server/totp.ts`, `src/lib/Admin2faOnboarding.svelte`, login en `src/lib/LoginForm.svelte`. Librería: **otplib**. |
| 2FA obligatorio siempre | ⚠️ | `ADMIN_2FA_REQUIRED=true` en `.env` (`src/lib/server/admin-2fa-policy.ts`). Sin «Ahora no»; alternativa: cerrar sesión. Pon `false` solo en dev. |
| Roles admin / operador / auditor | ✅ | `src/lib/server/auth.ts` — permisos `hasPermission()`. |
| Permisos granulares por acción | ⚠️ | Matriz en `src/lib/server/permissions.ts` (`vpn_read` / `vpn_write`, Pi-hole, backup…). Expuesto en `/api/auth/me` → `permissions[]`. |
| Usuarios del panel (usuario + contraseña + rol) | ✅ | `src/lib/server/panel-users-store.ts`, UI `src/lib/PanelUsersAdmin.svelte`, API `/api/admin/panel-users`. |
| Login legacy `.env` | ✅ | Usuarios `admin`, `auditor`, `operator` + variables `*_PASSWORD` / `*_PASSWORD_PBKDF2`. |
| Sesión corta + refresh | ⚠️ | Con **Redis**: `src/lib/server/session-store.ts` (access ~15 min, refresh ~30 días), `/api/auth/refresh`. Sin Redis: cookie `admin_session` 12 h. **No es JWT**. |
| Lockout / rate limit en login | ⚠️ | `src/lib/server/rate-limit.ts`, `lockoutCheck` en `src/routes/api/auth/login/+server.ts`. Mejor con Redis. |

---

## Datos y secretos

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| Claves OpenVPN cifradas en BD del panel | ❌ N/A | El panel no almacena claves VPN; las pide a **VM1** (`/api/admin/users`, `/api/admin/bundle`). |
| Cifrado de perfiles con master key en app | ❌ | No implementado para `.ovpn`. |
| `MASTER_KEY` para auditoría firmada | ⚠️ | `src/lib/server/audit-signed.ts` — cadena HMAC en `audit-critical.signed.jsonl`. Requiere `MASTER_KEY` en `.env`. |
| Vault / AWS Secrets Manager / SOPS | ❌ | Solo variables de entorno y ficheros en `data/`. |
| Logs cifrados en reposo (aplicación) | ❌ | `data/audit.jsonl` en texto plano. |
| Cifrado de disco (LUKS, etc.) | ❌ Infra | Responsabilidad del servidor; no está en el código. |
| TLS 1.3 obligatorio | ⚠️ Infra | El panel puede ir en HTTP en LAN (`COOKIE_SECURE=false`). |
| HSTS | ⚠️ | Solo si cookies seguras / HTTPS — `src/hooks.server.ts` + `shouldUseSecureCookies()`. |
| Certificate pinning | ❌ | No implementado. |

---

## Aplicación (hardening HTTP)

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| Rate limiting (auth, escritura) | ✅ | `src/lib/server/rate-limit.ts` — login, Pi-hole, panel-users, backup, 2FA, etc. |
| Protección CSRF | ✅ | `apiFetch()` en todo el frontend mutante; `npm run check:csrf`. Login/refresh/logout exentos. |
| CSP | ✅ | `svelte.config.js` — sin `upgrade-insecure-requests` en LAN HTTP. |
| Validación de dominios (ban Pi-hole) | ✅ | `src/routes/api/admin/pihole/domain/+server.ts` — `normalizeDomain`, `isValidDomain`, escape en wildcards. |
| Cabeceras X-Frame-Options, etc. | ✅ | `src/hooks.server.ts` |

---

## Auditoría

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| Registro de acciones (ban, usuarios VPN, export, …) | ✅ | `src/lib/server/audit.ts` → `data/audit.jsonl` |
| Log append-only firmado (acciones críticas) | ⚠️ | `writeCriticalAudit()` en dominio Pi-hole, internet-block, usuarios VPN, bundle, horarios, informe DNS. Necesita `MASTER_KEY`. |
| Auditoría de usuarios del panel | ⚠️ | `panel_user_*` en audit + `writeCriticalAudit` si hay `MASTER_KEY`. |
| UI de auditoría | ✅ | `src/routes/audit/` |

---

## Detección y alertas (`/seguridad`)

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| Integración URLhaus / AbuseCH | ⚠️ | `src/lib/server/urlhaus-sync.ts`, UI en Ajustes. Requiere `THREAT_INTEL_ENABLED` + `URLHAUS_AUTH_KEY`. Sync automático cada N horas. |
| Alertas por categorías (porn, gambling, …) | ⚠️ | Categorías en `src/lib/server/category-store.ts` — dominios **manuales** en Ajustes. |
| DNS tunneling (subdominios largos, entropía) | ✅ | `detectDnsTunnelingLike()` en `src/lib/server/security-insights.ts` |
| Consultas TXT sospechosas | ✅ | Misma heurística (`txt_suspect`) |
| Pico anómalo de consultas (exfiltración) | ⚠️ | `detectDnsAnomalies()` — vs media histórica; **no** “horario laboral” fijo. |
| Alertas logins fallidos | ✅ | `buildSecurityAlerts()` |
| UI Seguridad | ✅ | `src/routes/seguridad/` |

---

## Bloqueos y categorías

| Requisito | Estado | Dónde / notas |
|-----------|--------|----------------|
| Ban por dominio / wildcard | ✅ | Listas Pi-hole, API dominio, UI DNS y listas. |
| Bloqueo internet por IP (Pi-hole) | ✅ | `src/lib/server/internet-blocks-store.ts`, UI bloqueos / DNS. |
| Horarios por dispositivo (cortar internet) | ✅ | `block-schedules-store.ts`, `BlockSchedulePanel.svelte`; por **IP o CN VPN**. |
| Categorías predefinidas (social, streaming, …) | ⚠️ | `category-store.ts` — dominios editables en Ajustes. |
| Políticas categoría + IP + horario | ⚠️ | Backend `category-runner.ts` + UI `src/lib/CategoryPoliciesAdmin.svelte` en Ajustes. |
| Políticas por usuario VPN (CN) | ⚠️ | `target_type: vpn_cn` en políticas; resuelve IPs vía `vpn-ipcn-history.json`. |
| Grupos Pi-hole personalizados | ⚠️ | `PiholeGroupsAdmin.svelte`, `/api/admin/pihole-groups`, `group-policy-runner.ts`. |

---

## Despliegue (recordatorio)

```bash
cd /opt/fronted-vpn
sudo docker compose -f docker-compose.prod.yml up -d --build
```

- Datos persistentes: volumen `./data` → `/app/data` en el contenedor.
- Acceso típico LAN: `http://<IP>:2346` (HTTP, no forzar HTTPS en CSP).
- Variables críticas: ver `.env.example` (`SESSION_SECRET`, `ADMIN_PASSWORD`, `PIHOLE_*`, `VPN_*`, `REDIS_URL`, `MASTER_KEY`).

---

## Prioridades sugeridas (roadmap corto)

1. ~~Obligar 2FA para admins~~ → `ADMIN_2FA_REQUIRED` + modal sin «Ahora no».
2. ~~UI políticas de categorías~~ → `CategoryPoliciesAdmin.svelte` en Ajustes.
3. ~~Auditoría firmada usuarios panel~~ → `writeCriticalAudit` en `/api/admin/panel-users`.
4. ~~CSRF~~ → `apiFetch()` + cobertura manual con `csrfHeaders()` en componentes existentes.
5. ~~Threat intel URLhaus~~ → activar en `.env` y sincronizar desde Ajustes.
6. ~~Renovar sesión automáticamente~~ → `SessionExpiryBanner` renueva con `/api/auth/refresh` si quedan menos de 5 min.
7. HTTPS + HSTS → guía en [`docs/HTTPS.md`](HTTPS.md) (`COOKIE_SECURE`, `TRUST_PROXY`, Caddy/nginx).
8. ~~Tests e2e CSRF y roles~~ → `tests/e2e/csrf-and-roles.spec.ts`.
9. ~~Políticas categoría por CN VPN~~ → `target_type: vpn_cn` + UI en Ajustes.
10. ~~Guía de roles PDF~~ → `GET /api/admin/roles-guide?format=pdf` (`roles-guide-pdf.ts`).
11. ~~Grupos Pi-hole custom~~ → crear grupos + políticas por IP/CN en Ajustes.

---

*Documento generado para revisión con tutor / memoria del proyecto. Actualizar cuando cambie el código.*
