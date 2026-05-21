# HTTPS detrás de proxy (producción)

El panel funciona en **HTTP en LAN** (`COOKIE_SECURE=false`). Si lo expones con TLS (reverse proxy, túnel, VPN admin), ajusta el entorno para que cookies y cabeceras de seguridad se activen.

## Variables `.env`

```env
COOKIE_SECURE=true
TRUST_PROXY=true
```

- `COOKIE_SECURE=true`: cookies de sesión y CSRF solo por HTTPS.
- `TRUST_PROXY=true`: confía en `X-Forwarded-Proto: https` del proxy (necesario si el contenedor escucha HTTP pero el usuario entra por HTTPS).

Con esto, `hooks.server.ts` añade **HSTS**, **COOP** y **CORP** cuando detecta conexión segura.

## Ejemplo Caddy (LAN o FQDN interno)

```caddy
panel.vpn.lan {
    reverse_proxy 127.0.0.1:2346
}
```

Caddy termina TLS y reenvía HTTP al contenedor con `X-Forwarded-Proto: https`.

## Ejemplo nginx

```nginx
server {
    listen 443 ssl http2;
    server_name panel.ejemplo.lan;

    ssl_certificate     /etc/ssl/panel.crt;
    ssl_certificate_key /etc/ssl/panel.key;

    location / {
        proxy_pass http://127.0.0.1:2346;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## CSP en HTTPS

En `svelte.config.js`, `kit.csp` no fuerza `upgrade-insecure-requests` en LAN HTTP. Tras migrar a HTTPS de forma estable, puedes valorar activarlo solo en builds de producción TLS (evita romper assets si alguien entra aún por HTTP).

## Comprobación

1. Abre el panel por `https://...`
2. DevTools → Application → Cookies: `session` / `csrf_token` con flag **Secure**
3. Respuesta de cualquier página: cabecera `Strict-Transport-Security` (solo con TLS + `COOKIE_SECURE=true`)
