#!/usr/bin/env sh
# Copia de seguridad del directorio data/ (auditoría, alias, revocados ocultos).
# Uso: ./scripts/backup-data.sh [destino]
# Cron ejemplo (diario 2:00): 0 2 * * * /opt/fronted-vpn/scripts/backup-data.sh /var/backups/fronted-vpn

set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${ROOT}/data"
DEST="${1:-${ROOT}/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${DEST}/data-${STAMP}.tar.gz"

if [ ! -d "$SRC" ]; then
	echo "No existe ${SRC}; nada que respaldar." >&2
	exit 0
fi

mkdir -p "$DEST"
tar -czf "$OUT" -C "$ROOT" data
echo "Backup: $OUT"
