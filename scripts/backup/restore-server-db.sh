#!/usr/bin/env bash
# Restore a database created by snapshot-server-db.sh. This deliberately needs
# --confirm because it replaces the server's authoritative sync history.
set -euo pipefail
umask 077

if [ "$#" -ne 2 ] || [ "$1" != "--confirm" ]; then
  echo "Usage: $0 --confirm /absolute/path/server-snapshot-YYYYmmddTHHMMSSZ.db" >&2
  exit 2
fi

SNAPSHOT="$2"
if [ ! -f "$SNAPSHOT" ]; then
  echo "Snapshot does not exist: $SNAPSHOT" >&2
  exit 2
fi
if [ ! -f "${SNAPSHOT}.sha256" ]; then
  echo "Checksum file is required: ${SNAPSHOT}.sha256" >&2
  exit 2
fi

COMPOSE_FILE="${LT_COMPOSE_FILE:-infrastructure/docker/docker-compose.prod.yml}"
ENV_FILE="${LT_ENV_FILE:-.env.production}"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
cp "$SNAPSHOT" "$TEMP_DIR/learntrack.db"
cp "${SNAPSHOT}.sha256" "$TEMP_DIR/learntrack.db.sha256"
chmod 600 "$TEMP_DIR/learntrack.db" "$TEMP_DIR/learntrack.db.sha256"

EXPECTED_CHECKSUM="$(awk '{print $1}' "${SNAPSHOT}.sha256")"
ACTUAL_CHECKSUM="$(sha256sum "$TEMP_DIR/learntrack.db" | awk '{print $1}')"
if [ "$EXPECTED_CHECKSUM" != "$ACTUAL_CHECKSUM" ]; then
  echo 'Snapshot checksum mismatch' >&2
  exit 1
fi

# Validate SQLite before stopping the service. docker compose run uses the same
# application image, so no host Node.js or sqlite3 installation is required.
"${COMPOSE[@]}" run --rm --no-deps -v "$TEMP_DIR:/restore:ro" --entrypoint node learntrack --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  const db = new DatabaseSync("/restore/learntrack.db", { readOnly: true });
  try {
    const result = db.prepare("PRAGMA integrity_check").get();
    if (result.integrity_check !== "ok") throw new Error(`integrity_check: ${result.integrity_check}`);
    for (const table of ["schema_migrations", "sync_ops", "entity_versions"]) {
      db.prepare(`SELECT 1 FROM ${table} LIMIT 1`).all();
    }
  } finally { db.close(); }
'

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
"${COMPOSE[@]}" down

# Preserve the live database as a coherent SQLite snapshot before replacement.
# Copying only the main file would omit committed WAL pages.
"${COMPOSE[@]}" run --rm --no-deps -v "$TEMP_DIR:/restore:ro" --entrypoint node learntrack --input-type=module -e '
  import { DatabaseSync } from "node:sqlite";
  import { copyFileSync, existsSync, renameSync, rmSync } from "node:fs";
  const stamp = process.argv[1];
  const livePath = "/data/learntrack.db";
  if (existsSync(livePath)) {
    const db = new DatabaseSync(livePath);
    try {
      const quote = String.fromCharCode(39);
      const rollback = "/data/learntrack.db.pre-restore-" + stamp;
      db.exec("VACUUM INTO " + quote + rollback.replaceAll(quote, quote + quote) + quote);
    } finally { db.close(); }
  }
  copyFileSync("/restore/learntrack.db", "/data/learntrack.db.restore");
  renameSync("/data/learntrack.db.restore", livePath);
  rmSync(livePath + "-wal", { force: true });
  rmSync(livePath + "-shm", { force: true });
' "$STAMP"

"${COMPOSE[@]}" up -d
echo "Restore complete. Previous database: learntrack.db.pre-restore-${STAMP} in the lt-data volume."
