#!/usr/bin/env bash
# Copia la API interna de netmonitor (requiere permisos de escritura en /opt/netmonitor).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
NM="/opt/netmonitor/web"
if [[ ! -d "$NM/src" ]]; then
	echo "No existe $NM — ajusta la ruta de netmonitor." >&2
	exit 1
fi
cp -v "$ROOT/web/src/lib/server/internal-api.ts" "$NM/src/lib/server/internal-api.ts"
mkdir -p "$NM/src/routes/api/internal/devices"
mkdir -p "$NM/src/routes/api/internal/health"
cp -v "$ROOT/web/src/routes/api/internal/devices/+server.ts" "$NM/src/routes/api/internal/devices/+server.ts"
cp -v "$ROOT/web/src/routes/api/internal/health/+server.ts" "$NM/src/routes/api/internal/health/+server.ts"
if [[ ! -f "$NM/.env" ]]; then
	cp -v "$ROOT/web/.env.example" "$NM/.env"
	echo "Creado $NM/.env — revisa INTERNAL_API_KEY."
else
	echo "Ya existe $NM/.env (no sobrescrito)."
fi
echo "Listo. Reinicia: cd /opt/netmonitor && docker compose up -d --force-recreate netmonitor-web"
