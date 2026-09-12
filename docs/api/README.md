# API 说明（/api/v1）

所有接口除 `health`、`auth/login` 外需有效会话 Cookie（HttpOnly）。

## auth
- `POST /auth/login` `{username, password}` → 设置会话 Cookie；失败 401，15 分钟内失败 5 次后 429。
- `POST /auth/logout`、`GET /auth/session`。

## sync
- `POST /sync/push` `{deviceId, lastCursor, ops[]}`；op 由 `opId` 幂等去重（重放只确认不重放效果）；`baseVersion` 落后于服务端版本时进入 `conflicts`，保留双方候选。响应 `{appliedOpIds, conflicts, cursor}`。
- `GET /sync/pull?cursor=N` → `{cursor, ops[]}`（含删除标记的 tombstone payload）。

## backups
- `GET /backups` → 生成快照 ZIP，返回 `{fileName, checksum, counts, downloadUrl}`。
- `GET /backups/:name` → 下载 ZIP。

## health
- `GET /health` → `{ok, db, version}`，无需登录。
