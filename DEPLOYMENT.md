# LearnTrack 部署与恢复

本文部署的是单站点模式：浏览器、登录接口和同步接口使用同一个 HTTPS 域名。生产环境由 Caddy 自动申请和续期证书，SQLite 数据与证书均保存在 Docker 命名卷中。

## 运行条件

- 一台 Linux/ECS 主机，已安装 Docker Engine 和 Docker Compose v2。
- 一个公网域名；DNS 的 `A` 记录（以及实际使用 IPv6 时的 `AAAA` 记录）指向该主机。
- 云安全组和主机防火墙放行 TCP `80`、TCP `443` 与 UDP `443`。不要放行 `8787`。
- 域名解析生效后再首次启动。Caddy 需要从公网访问 80/443 才能签发证书。

## 首次部署

在服务器上克隆仓库并进入仓库根目录：

```bash
git clone https://github.com/PaoPao1021/LearnTrack.git
cd LearnTrack
cp .env.production.example .env.production
chmod 600 .env.production
```

编辑 `.env.production`。`LT_DOMAIN` 填纯域名，例如 `learntrack.example.com`；不要带 `https://` 或末尾 `/`。密码、密码盐和会话密钥必须是独立的高熵随机值，可在服务器本地生成：

```bash
openssl rand -base64 32
```

将生成结果分别填入 `LT_PASSWORD`、`LT_PASSWORD_SALT` 与 `LT_SESSION_SECRET`。Compose 对账号、密码、盐、会话密钥、域名和 ACME 邮箱均使用必填插值：空值或遗漏会使生产配置检查和启动失败，不会带着默认密钥运行。

先检查配置，再构建并启动：

```bash
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml config
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml up -d --build
curl -fsS https://learntrack.example.com/api/v1/health
```

健康检查应返回 `"ok":true`。首次申请证书时可通过以下命令查看 Caddy 日志：

```bash
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml logs -f caddy
```

生产 compose 不发布 API 端口；只有 Caddy 公开 80/443。它覆写 `X-Forwarded-For`，API 只信任这一跳代理（`LT_TRUST_PROXY=1`）。这避免客户端伪造转发 IP 来规避登录限流。`LT_COOKIE_SECURE=true` 由生产配置固定，HTTPS 会话 Cookie 不会在明文 HTTP 中发送。

## 客户端同步地址

在应用的设置页填写同步服务地址：

- 填 `/`：使用当前页面的同源地址。生产环境推荐此项，登录 Cookie 和 API 请求均保持在 `https://你的域名` 下。
- 填完整地址时也必须是当前页面的同源地址，例如页面本身打开在 `https://learntrack.example.com`。当前 API 没有跨域 CORS 配置，不能用它连接另一域名的服务。
- 留空：关闭同步，应用仍可离线记录。

第一次使用或恢复服务器后，填写 `/` 并登录。开发时 Vite 的 `/api` 代理也支持 `/`，因此前端开发地址 `http://localhost:5173` 可连接本地 API。

## 本机 HTTP compose

`infrastructure/docker/docker-compose.yml` 是本机测试配置，Nginx 只绑定 `127.0.0.1:8080`，访问地址为 `http://127.0.0.1:8080`。它显式使用非安全 Cookie，仅限本机 HTTP；不要将该 compose 文件用于公网服务。

```bash
cp .env.example .env
docker compose -f infrastructure/docker/docker-compose.yml up --build
```

## 更新

更新前先生成一个数据库快照，随后拉取并重建。命名卷不会被 `up -d --build` 或普通 `down` 删除。

```bash
./scripts/backup/snapshot-server-db.sh
git pull --ff-only
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml ps
```

不要执行 `docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml down -v`，它会删除包含 SQLite 数据、服务端备份和 Caddy 证书的命名卷。

## 备份

服务端权威数据是 `lt-data` 卷中的 SQLite 数据库。`snapshot-server-db.sh` 在运行中的 SQLite 上执行 `VACUUM INTO`，生成一致的单文件快照和 SHA-256 校验文件到主机目录；默认保留 14 份。该快照包含同步操作、实体版本、迁移记录和会话表，可用于服务器恢复。快照目录及文件以仅属主可读写的权限创建。

```bash
chmod +x scripts/backup/snapshot-server-db.sh scripts/backup/restore-server-db.sh
./scripts/backup/snapshot-server-db.sh
```

无需 Docker 的脚本回归测试可在仓库根目录运行；它会模拟 Docker 调用，并用 Node 创建最小 SQLite 数据库以覆盖恢复前校验：

```bash
./scripts/backup/test-deploy-scripts.sh
```

建议将快照目录同步到另一台机器或对象存储。下面的 crontab 每天 03:20 生成一次；将仓库路径替换成实际路径：

```cron
20 3 * * * cd /srv/LearnTrack && ./scripts/backup/snapshot-server-db.sh >> /var/log/learntrack-backup.log 2>&1
```

应用的 `/api/v1/backups` 和 `scripts/backup/pull-backup-macos.sh` 生成的是同步数据导出，适合下载与核对同步记录；当前版本不把它作为服务器灾难恢复格式。服务器恢复应使用上述数据库快照。浏览器端的“完整备份”用于恢复该浏览器的 IndexedDB，和服务器 SQLite 快照是两套独立的备份。

还应离线保存 `.env.production`：数据库恢复后仍需要同一份 `LT_SESSION_SECRET` 才能识别既有会话。该文件包含敏感信息，不要提交或上传到公开存储。

## 恢复演练与正式恢复

恢复会停止服务、覆盖服务器 SQLite 数据库，并在 `lt-data` 卷内保留一份 `learntrack.db.pre-restore-时间戳`。这份回滚副本通过 SQLite `VACUUM INTO` 生成，包含已提交的 WAL 数据，而不是直接复制主数据库文件。脚本在停止服务前验证 SHA-256、SQLite `integrity_check` 和关键表结构。

```bash
./scripts/backup/restore-server-db.sh --confirm \
  /srv/LearnTrack/var/server-snapshots/server-snapshot-YYYYmmddTHHMMSSZ.db
docker compose --env-file .env.production -f infrastructure/docker/docker-compose.prod.yml ps
curl -fsS https://learntrack.example.com/api/v1/health
```

恢复到过去时，旧浏览器的本地数据库仍可能保留恢复点之后已经确认的记录；仅重置同步游标不能让这些本地记录自动回到服务器恢复点。恢复前先导出每个浏览器的完整备份。恢复后应使用一个新的浏览器配置文件或已清空站点数据的隔离浏览器填写 `/`、登录并核对服务器状态；确认后再按需导入已核验的浏览器备份。不要让旧客户端直接继续推送，以免把恢复点之后的数据重新写入服务器。

建议至少每季度在隔离的测试主机上执行一次“快照恢复 → 健康检查 → 客户端重新同步”的演练。
