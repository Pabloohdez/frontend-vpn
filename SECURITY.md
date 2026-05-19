# Política de seguridad y publicación

Este repositorio **no debe contener**:

- Direcciones IP privadas, hostnames internos ni rangos de tu LAN.
- Tokens, contraseñas, hashes o claves API en archivos commiteados.
- Volcados de datos reales (`data/`, `*.jsonl`, `*.json` con auditoría, alias,
  historial IP↔CN, listas exportadas, internet-blocks, etc.).
- Informes generados (`*.pdf`, `*.csv`, `*.xlsx`).
- Capturas de pantalla con IPs, MACs, dominios internos o usuarios reales.

Todo lo anterior está cubierto por el [`.gitignore`](./.gitignore) y debe permanecer
así. Antes de cada push, ejecuta:

```bash
git status
git diff --staged
```

y comprueba que no aparece ninguno de esos artefactos.

## Antes del primer push al repositorio público

1. Verifica que `git log` está vacío o no contiene secretos antiguos. Si has
   trabajado antes en otra rama con datos reales, **crea un repositorio nuevo
   sin historial** (ver «Publicación limpia» más abajo).
2. Comprueba con `git check-ignore` que `.env`, `data/`, `*.pdf`, etc. están
   ignorados:
   ```bash
   git check-ignore -v .env data/audit.jsonl integrations/netmonitor/web/.env
   ```
3. Asegúrate de que `.env.example` no contiene IPs, hostnames ni claves reales,
   solo placeholders como `CAMBIA_HOST_...` o `CAMBIA_POR_TOKEN_...`.
4. Rota cualquier credencial que haya estado alguna vez en un `.env` o archivo
   commiteado por error (token Pi-hole, password de la API VPN, `SESSION_SECRET`,
   `ADMIN_PASSWORD`, `AUDITOR_PASSWORD`, `INTERNAL_API_KEY` de netmonitor…).

## Publicación limpia (sin historial sensible)

Si quieres publicar este proyecto como repositorio nuevo, **descarta el
historial** del directorio de desarrollo y empieza desde cero:

```bash
# 1. Sincroniza los cambios y haz copia de seguridad fuera del repo.
rsync -a --exclude node_modules --exclude .git --exclude data \
      /opt/fronted-vpn/ /tmp/fronted-vpn-clean/

# 2. Trabaja sobre la copia limpia.
cd /tmp/fronted-vpn-clean

# 3. Borra lo que NUNCA debe llegar a GitHub.
rm -f .env
rm -rf data
find . -name '*.pdf' -delete
find . -name '*.csv' -delete
find . -name '*.xlsx' -delete

# 4. Init nuevo repo y primer commit (sin historial sensible).
git init -b main
git add .
git commit -m "Initial public release"

# 5. Sube al repo remoto vacío.
git remote add origin git@github.com:<USUARIO>/<REPO>.git
git push -u origin main
```

> El árbol original en `/opt/fronted-vpn` sigue funcionando y manteniendo el
> `.env` con secretos reales en el servidor. Sólo la copia limpia se sube.

## Configuración mínima para producción

Después de clonar el repo público en un servidor:

1. `cp .env.example .env` y rellena todos los valores con secretos **únicos**
   por entorno (no reutilices los de desarrollo).
2. Genera secretos fuertes:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
3. Cifrado de contraseñas con PBKDF2:
   ```bash
   node -e "const c=require('crypto');const s=c.randomBytes(16).toString('hex');const it=600000;const p='TU_CLAVE';const k=c.pbkdf2Sync(p,Buffer.from(s,'hex'),it,32,'sha256').toString('hex');console.log(s+':'+it+':'+k)"
   ```
   Pega el resultado en `ADMIN_PASSWORD_PBKDF2` y deja `ADMIN_PASSWORD` vacío.
4. Pon el panel detrás de un proxy TLS (caddy, nginx, traefik…) con
   `COOKIE_SECURE=true` y `TRUST_PROXY=true`. Nunca expongas el puerto 2346
   directamente a internet sin HTTPS.
5. Restringe el acceso por firewall a la VLAN de administración.

## Reporte de vulnerabilidades

Si descubres un fallo de seguridad, **no abras issue público**. Contacta en
privado al mantenedor del repositorio (correo en el perfil de GitHub) con un
PoC mínimo. Las CVE públicas se asignarán tras corregir.
