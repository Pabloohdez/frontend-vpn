#!/usr/bin/env bash
# Repara netmonitor cuando devuelve 401. Ejecutar como root en el servidor.
# Variables de entorno opcionales:
#   NM_ROOT    Ruta base del despliegue de netmonitor (default /opt/netmonitor)
#   NM_PORT    Puerto interno expuesto en el host (default 2347)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NM_ROOT="${NM_ROOT:-/opt/netmonitor}"
NM_PORT="${NM_PORT:-2347}"
NM="$NM_ROOT/web"
COMPOSE="$NM_ROOT/docker-compose.yml"

bash "$ROOT/deploy.sh"

cp -f "$ROOT/web/.env" "$NM/.env"
chmod 644 "$NM/.env"
echo "OK: $NM/.env"

# Asegurar env_file en docker-compose (idempotente)
if ! grep -q 'env_file:' "$COMPOSE" 2>/dev/null; then
	sed -i '/netmonitor-web:/,/depends_on:/{
    /ports:/a\
    env_file:\
      - ./web/.env
  }' "$COMPOSE" || {
		echo "Añade manualmente bajo netmonitor-web:" >&2
		echo "  env_file:" >&2
		echo "    - ./web/.env" >&2
	}
fi

cd "$NM_ROOT"
docker compose up -d --force-recreate netmonitor-web
echo "Esperando arranque de Vite (45s)..."
sleep 45

echo "--- health ---"
curl -s "http://127.0.0.1:${NM_PORT}/api/internal/health" || true
echo ""
echo "--- devices ---"
curl -s -w "\nHTTP:%{http_code}\n" \
  -H "Authorization: Bearer $(grep INTERNAL_API_KEY "$NM/.env" | cut -d= -f2)" \
  "http://127.0.0.1:${NM_PORT}/api/internal/devices" | head -c 200
echo ""
