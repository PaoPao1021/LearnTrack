-- Group replay checks and paginated pull tails must not scan the full sync log.
CREATE INDEX IF NOT EXISTS idx_sync_ops_group_seq ON sync_ops (op_group_id, seq);
