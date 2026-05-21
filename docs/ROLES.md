# Guía de roles — Panel VPN

> Copia orientativa. La versión al día se genera desde el código:
> - **Ajustes → Guía de roles (.md)** o `GET /api/admin/roles-guide`
> - **Ajustes → Guía de roles (.pdf)** o `GET /api/admin/roles-guide?format=pdf`

## Resumen

| Rol | Uso | Escritura VPN | Pi-hole / bloqueos |
|-----|-----|---------------|-------------------|
| **admin** | IT | Crear, revocar, perfiles | Sí |
| **operator** | Soporte / aulas | Solo ver clientes | Sí |
| **auditor** | Dirección / tutor | Solo ver (limitado) | No |

## Políticas por CN OpenVPN

Tanto **categorías DNS** (`panel-cat-*`) como **horarios de corte de internet** admiten objetivo:

- **IP** del cliente en Pi-hole, o
- **CN** (usuario certificado OpenVPN) — el panel aplica la regla a todas sus IPs conocidas.

Requisito: histórico IP↔CN actualizado (pestaña OpenVPN o tráfico reciente).

## Documentación relacionada

- [`SECURITY.md`](./SECURITY.md) — checklist de seguridad
- [`HTTPS.md`](./HTTPS.md) — TLS y proxy inverso
