#!/usr/bin/env bash
# Create a transactionally consistent server SQLite snapshot on the host.
# Run from the repository root on the production host, for example via cron.
set -euo pipefail
umask 077

COMPOSE_FILE="${LT_COMPOSE_FILE:-infrastructure/docker/docker-compose.prod.yml}"
ENV_FILE="${LT_ENV_FILE:-.env.production}"
DEST_DIR="${LT_SERVER_SNAPSHOT_DEST:-$PWD/var/server-snapshots}"
KEEP="${LT_SERVER_SNAPSHOT_KEEP:-14}"

case "$KEEP" in
  ''|0|*[!0-9]*) echo 'LT_SERVER_SNAPSHOT_KEEP must be a positive integer' >&2; exit 2 ;;
esac

mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
CONTAINER_FILE="/backups/server-snapshot-${STAMP}.db"
HOST_FILE="$DEST_DIR/server-snapshot-${STAMP}.db"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

# VACUUM INTO is SQLite's consistent online snapshot mechanism. The destination
# is a single database file, so no WAL/SHM sidecar has to be copied.
"${COMPOSE[@]}" exec -T learntrack node --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const target = process.argv[1];
  const db = new DatabaseSync("/data/learntrack.db");
  try {
    const quote = String.fromCharCode(39);
    db.exec("VACUUM INTO " + quote + target.replaceAll(quote, quote + quote) + quote);
  }
  finally { db.close(); }
' "$CONTAINER_FILE"

"${COMPOSE[@]}" cp "learntrack:${CONTAINER_FILE}" "$HOST_FILE"
"${COMPOSE[@]}" exec -T learntrack rm -f "$CONTAINER_FILE"

chmod 600 "$HOST_FILE"
sha256sum "$HOST_FILE" > "${HOST_FILE}.sha256"
chmod 600 "${HOST_FILE}.sha256"

# Snapshot names start with a sortable UTC timestamp, so lexical order is also
# chronological order. Shell globs preserve paths containing spaces here.
shopt -s nullglob
SNAPSHOTS=("$DEST_DIR"/server-snapshot-*.db)
STALE_COUNT=$((${#SNAPSHOTS[@]} - KEEP))
for ((index = 0; index < STALE_COUNT; index++)); do
  file="${SNAPSHOTS[index]}"
  rm -f -- "$file" "${file}.sha256"
done

echo "Snapshot created: $HOST_FILE"
