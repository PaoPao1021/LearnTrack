-- LearnTrack server schema v1: append-only sync ops + per-entity version index.
CREATE TABLE IF NOT EXISTS sync_ops (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  op_id TEXT NOT NULL UNIQUE,
  device_id TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  base_version INTEGER,
  payload TEXT,
  op_group_id TEXT,
  client_timestamp TEXT NOT NULL,
  server_timestamp TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_ops_seq ON sync_ops (seq);
CREATE INDEX IF NOT EXISTS idx_sync_ops_entity ON sync_ops (entity, entity_id);

-- Authoritative version per entity for conflict detection.
CREATE TABLE IF NOT EXISTS entity_versions (
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity, entity_id)
);

-- Session store (server restart keeps sessions optional; simple persisted tokens).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS login_attempts (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_started_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS backup_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_at TEXT NOT NULL,
  file_name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  counts_json TEXT NOT NULL
);
