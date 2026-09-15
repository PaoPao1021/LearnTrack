#!/usr/bin/env bash
# Fast regression test for deployment scripts. It mocks Docker lifecycle calls,
# but executes the restore script's read-only SQLite validation with host Node.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT
mkdir -p "$TEMP_DIR/snapshot dir"

docker() {
  local -a args=("$@")
  local entrypoint='' script='' mount='' node_script='' host_path=''
  local index
  printf '%q ' "$@" >> "${LT_MOCK_DOCKER_LOG:?}"
  printf '\n' >> "$LT_MOCK_DOCKER_LOG"
  case " $* " in
    *" cp "*) printf 'mock database' > "${!#}" ;;
  esac

  # For the first restore `compose run`, execute the embedded integrity check
  # against the host directory that is mounted at /restore in the real command.
  for ((index = 0; index < ${#args[@]}; index++)); do
    case "${args[index]}" in
      --entrypoint) entrypoint="${args[index + 1]}" ;;
      -v) mount="${args[index + 1]}" ;;
      -e) script="${args[index + 1]}" ;;
    esac
  done
  if [ "$entrypoint" = 'node' ] && [[ "$script" == *'PRAGMA integrity_check'* ]]; then
    host_path="${mount%:/restore:ro}"
    node_script="${script//\/restore\/learntrack.db/$host_path/learntrack.db}"
    node --input-type=module -e "$node_script"
  fi
}
export -f docker
export LT_MOCK_DOCKER_LOG="$TEMP_DIR/docker.log"

LT_COMPOSE_FILE='compose-test.yml' LT_ENV_FILE='test-env-file' \
  LT_SERVER_SNAPSHOT_DEST="$TEMP_DIR/snapshot dir" LT_SERVER_SNAPSHOT_KEEP=1 \
  "$REPO_ROOT/scripts/backup/snapshot-server-db.sh"
test -f "$TEMP_DIR/snapshot dir"/server-snapshot-*.db
test -f "$TEMP_DIR/snapshot dir"/server-snapshot-*.db.sha256
grep -F -- '--env-file test-env-file' "$TEMP_DIR/docker.log" >/dev/null
if LT_SERVER_SNAPSHOT_KEEP=0 "$REPO_ROOT/scripts/backup/snapshot-server-db.sh" >/dev/null 2>&1; then
  echo 'KEEP=0 unexpectedly succeeded' >&2
  exit 1
fi

DATABASE_FILE="$TEMP_DIR/restore source.db"
node --input-type=module - "$DATABASE_FILE" <<'JS'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync(process.argv[2]);
db.exec('CREATE TABLE schema_migrations (name TEXT); CREATE TABLE sync_ops (seq INTEGER); CREATE TABLE entity_versions (version INTEGER)');
db.close();
JS
sha256sum "$DATABASE_FILE" > "$DATABASE_FILE.sha256"

assert_no_down() {
  if grep -Eq '(^| )down( |$)' "$LT_MOCK_DOCKER_LOG"; then
    echo 'restore failure unexpectedly stopped the service' >&2
    exit 1
  fi
}

BAD_CHECKSUM_FILE="$TEMP_DIR/bad checksum.db"
cp "$DATABASE_FILE" "$BAD_CHECKSUM_FILE"
printf '0000  %s\n' "$BAD_CHECKSUM_FILE" > "$BAD_CHECKSUM_FILE.sha256"
: > "$TEMP_DIR/bad-checksum.log"
export LT_MOCK_DOCKER_LOG="$TEMP_DIR/bad-checksum.log"
if LT_COMPOSE_FILE='compose-test.yml' LT_ENV_FILE='test-env-file' \
  "$REPO_ROOT/scripts/backup/restore-server-db.sh" --confirm "$BAD_CHECKSUM_FILE" >/dev/null 2>&1; then
  echo 'bad checksum unexpectedly restored' >&2
  exit 1
fi
assert_no_down

NOT_SQLITE_FILE="$TEMP_DIR/not sqlite.db"
printf 'not a SQLite database' > "$NOT_SQLITE_FILE"
sha256sum "$NOT_SQLITE_FILE" > "$NOT_SQLITE_FILE.sha256"
: > "$TEMP_DIR/not-sqlite.log"
export LT_MOCK_DOCKER_LOG="$TEMP_DIR/not-sqlite.log"
if LT_COMPOSE_FILE='compose-test.yml' LT_ENV_FILE='test-env-file' \
  "$REPO_ROOT/scripts/backup/restore-server-db.sh" --confirm "$NOT_SQLITE_FILE" >/dev/null 2>&1; then
  echo 'non-SQLite input unexpectedly restored' >&2
  exit 1
fi
assert_no_down

export LT_MOCK_DOCKER_LOG="$TEMP_DIR/docker.log"
LT_COMPOSE_FILE='compose-test.yml' LT_ENV_FILE='test-env-file' \
  "$REPO_ROOT/scripts/backup/restore-server-db.sh" --confirm "$DATABASE_FILE"
grep -F -- '--env-file test-env-file' "$TEMP_DIR/docker.log" >/dev/null

echo 'deployment script mock regression passed'
