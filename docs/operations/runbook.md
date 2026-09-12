# 运维手册

## 日常运行

- 单机直启：`LT_PASSWORD=… LT_PORT=8787 node apps/api/dist/app/server.js`（同源提供页面与 API）。
- Docker：`cd infrastructure/docker && docker compose up -d --build`。
- 健康检查：`GET /api/v1/health` 返回 `{ok, db, version}`。

## 备份

- 服务端：`GET /api/v1/backups` 生成一致性快照（`VACUUM INTO`）并打包 ZIP（manifest.json + data.json），记录写入 `backup_log`。
- 服务端每日备份：用 cron / LaunchAgent 每天调用一次该接口即可；保留 7 个每日 + 4 个每周版本（脚本侧按数量滚动删除）。
- 电脑端：`scripts/backup/pull-backup-macos.sh`，下载后校验 checksum，成功才更新 `.last_computer_backup_at`。
- 设置页分别显示“服务器备份生成时间”与“电脑确认保存时间”。

## 恢复

1. 用浏览器端“设置 → 从备份恢复”先校验（格式版本、checksum），确认摘要后原子替换。
2. 服务端恢复：停止写入 → 用备份 ZIP 中 data.json 的 ops/entity_versions 重建 SQLite（恢复工具位于 scripts/restore，按 backup_log 校验后导入）→ 生成新的同步代号提示旧设备重新对账。
3. 旧设备不得把旧同步游标用于新数据库；恢复后旧设备拉取 cursor=0 重新初始化。

## ECS 迁移

正常：设备同步归零 → 旧服务只读 → 生成最终备份 → 新环境恢复校验 → 切域名 → 保留旧服务只读作回退。
旧 ECS 不可用：从电脑备份恢复 → 旧设备保全本地数据 → 与新服务对账（按 opId 去重，分歧进冲突处理）。

## 排障

- 登录 429：15 分钟内失败超过 5 次，等待窗口重置或清理 `login_attempts` 表。
- 同步失败：查看设置页“最近错误”；确认服务器地址、证书与会话有效期。
- 数据库损坏：用最近一次校验通过的电脑备份恢复；WAL 模式下勿直接拷贝主文件。
