# LearnTrack 学习时间账本

本地优先的个人学习时间记录 Web 应用：随时记录实际投入的时间，按科目复盘；添加学习目录后展示进度。不需要强制专注模式。

详细产品规则见 [DEVELOPMENT.md](./DEVELOPMENT.md) 与 [docs/](./docs)。

## 功能

- **自由记时**：手动时长、起止时间段（支持跨午夜）、正计时 / 自定义倒计时、暂停不计入时长、刷新后按绝对时间戳恢复；活动选择支持输入即搜（大科目/科目/活动任意片段匹配，方向键 + 回车选择）。
- **统计总览**：总时长、记录次数、两种日均、三级科目分布、趋势（含上期对比）、热力图、小时分布、时间段覆盖率、可选自评状态与打断统计。
- **学习进度**：章节清单（叶子进度）或数量目标（如 1000 题完成 120 题），支持批量粘贴章节；时间记录可附带数量增量，独立保存、独立撤销。
- **轻量计划**：今日待办、截止日期、每日 / 每周时长目标。
- **外观**：浅色 / 深色 / 跟随系统、主题色。
- **数据自主**：离线可用（IndexedDB）、完整 JSON 备份导出 / 校验 / 恢复、CSV 明细、可选 ECS / 本机同步服务。

## 目录结构

```text
apps/web        React + Vite + Dexie + ECharts 前端（PWA）
apps/api        Fastify + node:sqlite 同步 / 备份服务
packages/domain 纯领域计算（时间、统计、进度）
packages/contracts Zod API 契约
database/       服务端 SQL 迁移
infrastructure/ Docker Compose、Nginx、LaunchAgent
scripts/        备份拉取脚本
var/            本地运行数据（不入库）
```

## 本机开发

要求 Node.js 24+（使用内置 `node:sqlite`，无需原生编译）。

```bash
npm install
npm run dev:web     # 前端 http://localhost:5173（代理 /api 到 8787）
npm run dev:api     # 需要 LT_PASSWORD：LT_PASSWORD=test1234 npm run dev:api
npm test            # 领域规则单测
npm run build       # 全量构建
```

API 首次启动前复制 `.env.example` 为 `.env` 并设置 `LT_USERNAME` / `LT_PASSWORD` / `LT_SESSION_SECRET`。

纯离线使用：只启动前端即可，所有数据保存在浏览器 IndexedDB；在设置页导出完整备份。

## 同步服务

`apps/api` 同源提供前端页面与 `/api/v1` 接口（auth / sync push-pull / backups / health）。

- 每个客户端操作带唯一 opId，服务端幂等去重；版本冲突保留双方候选，不静默覆盖。
- 数据流：本地事务 → 界面更新 → 待同步队列 → 推送 / 拉取（前台每 15 秒 + 联网恢复 / 回前台立即触发）。

## 生产部署（ECS）

```bash
cp .env.example .env   # 填真实值
cd infrastructure/docker
docker compose up -d --build
```

SQLite 与备份挂载在 `lt-data` / `lt-backups` 卷，更新容器不删数据。建议在前面配置 HTTPS（`infrastructure/nginx/`）。

## 自动备份到电脑（macOS）

```bash
# ~/.learntrack-backup-env 中设置：
# export LT_SERVER_URL=https://your-domain
# export LT_BACKUP_USER=... LT_BACKUP_PASSWORD=...（只读取凭据）
cp infrastructure/systemd/com.learntrack.backup-pull.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.learntrack.backup-pull.plist
```

登录时及每 6 小时拉取新备份到 `~/Documents/StudyTrackerBackups`，校验 checksum 通过才算备份成功，保留最近 30 份。

## 迁移

ECS 到期：各设备同步归零 → 旧服务只读、生成最终备份 → 新环境恢复校验 → 切域名。旧 ECS 不可用时，用电脑备份恢复并生成新同步代号，旧设备重新对账。详见 [docs/operations/runbook.md](./docs/operations/runbook.md)。

## 已验证

- 领域单测 9 项通过（跨午夜拆分、暂停区间、重叠、统计口径、进度计算等）。
- API 烟雾测试：登录 / 会话、推送幂等（重放不重复入账）、增量拉取、备份 ZIP 生成、错误密码 401 + 限流。
- 浏览器实测：种子分类初始化、补录 90 分钟入统计、统计页图表与下钻、数量目标 120/1000 显示 12%、总览进度条。

未实测（如实标注）：真实手机锁屏 / PWA 安装实机、双设备并发冲突 UI 全流程、5 万条性能压测。
