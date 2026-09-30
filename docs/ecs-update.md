# ECS Docker Compose 保留数据更新方案

适用于现有 LearnTrack Compose 部署。尚未连接你的 ECS；项目路径、实际 Compose 参数、卷名和线上版本需要按下面的只读步骤核对。不要更换部署目录、项目名、域名或端口。

本次浏览器 IndexedDB 从版本 3 升至 4，只新增计划、练习与讲次进度表；旧表、记录、设置和待同步队列保留。服务端仍使用原有 SQLite 表和操作日志。新增实体需要新版服务端与前端配套使用。

## 1. 先备份各浏览器

在原网址的设置页导出**完整 JSON 备份**，分别保存每个有数据的浏览器和设备，包含未同步队列。CSV 不能完整恢复应用。记录历史记录数和累计时长，结束正在运行的计时器，更新验收期间暂停录入。

保持原协议、域名与端口；HTTP 改 HTTPS、IP 改域名会进入另一个浏览器存储空间。不要清除站点数据、IndexedDB 或重置应用。服务器数据卷不包含尚未同步的浏览器记录。

## 2. 核对原部署并保留镜像、配置

进入 ECS **原仓库根目录**，查询正在运行的应用容器：

```bash
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}'
```

在同一个 Bash 会话中执行，替换容器 ID：

```bash
set -euo pipefail
LT_CONTAINER='替换为当前 learntrack 应用容器ID'
LT_PROJECT=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$LT_CONTAINER")
test -n "$LT_PROJECT"
test "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$LT_CONTAINER")" = learntrack
docker inspect -f '{{index .Config.Labels "com.docker.compose.project.config_files"}}' "$LT_CONTAINER"
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_CONTAINER"
```

按原部署选择下面三个变量；不要因为文件存在就改用另一份配置。

| 原部署 | `LT_COMPOSE` | `LT_ENV` | `LT_PROXY` |
| --- | --- | --- | --- |
| HTTPS / Caddy | `infrastructure/docker/docker-compose.prod.yml` | `.env.production` | `caddy` |
| 本机 HTTP / Nginx | `infrastructure/docker/docker-compose.yml` | `.env` | `nginx` |

以已有生产配置为例：

```bash
LT_COMPOSE="$PWD/infrastructure/docker/docker-compose.prod.yml"
LT_ENV="$PWD/.env.production"
LT_PROXY=caddy
test -f "$LT_COMPOSE"
test -f "$LT_ENV"
lt_compose() { docker compose -p "$LT_PROJECT" --env-file "$LT_ENV" -f "$LT_COMPOSE" "$@"; }
lt_compose ps
```

若原部署用了 override 文件、自定义卷或额外环境参数，把**原来的全部参数**加入函数。核对 `lt_compose ps` 指向上面的容器，挂载目标含 `/data` 和 `/backups`。配置不一致时不要继续。

```bash
LT_STAMP=$(date +%Y%m%d-%H%M%S)
LT_SNAPSHOT="$HOME/learntrack-release-backups/$LT_STAMP"
mkdir -p "$LT_SNAPSHOT"
chmod 700 "$LT_SNAPSHOT"
cp "$LT_ENV" "$LT_SNAPSHOT/env"
cp "$LT_COMPOSE" "$LT_SNAPSHOT/docker-compose.yml"
git rev-parse HEAD > "$LT_SNAPSHOT/source-commit.txt"
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_CONTAINER" > "$LT_SNAPSHOT/mounts-before.txt"
LT_OLD_IMAGE=$(docker inspect -f '{{.Image}}' "$LT_CONTAINER")
LT_ROLLBACK_IMAGE="learntrack-rollback:$LT_STAMP"
docker image tag "$LT_OLD_IMAGE" "$LT_ROLLBACK_IMAGE"
docker image save "$LT_ROLLBACK_IMAGE" | gzip > "$LT_SNAPSHOT/old-image.tar.gz"
```

同时复制使用中的代理配置和 override 文件。备份目录含配置密钥及个人数据，不放进 Git 或网站静态目录。

## 3. 停写后备份 SQLite 持久卷

短暂停止应用，复制整个 `/data`（含可能存在的 WAL/SHM 文件）与 `/backups`；`docker cp` 支持已停止的容器。

```bash
lt_compose stop learntrack
docker cp "$LT_CONTAINER:/data" "$LT_SNAPSHOT/data"
docker cp "$LT_CONTAINER:/backups" "$LT_SNAPSHOT/backups"
test -s "$LT_SNAPSHOT/data/learntrack.db"
tar -czf "$LT_SNAPSHOT/server-data.tar.gz" -C "$LT_SNAPSHOT" data backups
gzip -t "$LT_SNAPSHOT/server-data.tar.gz"
sha256sum "$LT_SNAPSHOT/server-data.tar.gz" > "$LT_SNAPSHOT/server-data.sha256"
lt_compose start learntrack
```

复制或检查失败时先执行 `lt_compose start learntrack` 恢复原服务，停止更新。成功后将备份另存到本地或其他存储。运行中仅复制主 `.db` 文件可能漏掉 WAL 中已提交的数据，不能代替此步骤。

## 4. 拉取已验证提交并构建

服务器先执行 `git status --short`，有修改时保留并处理，不能用 `reset --hard` 覆盖。确认发布分支后拉取已验证的提交；不要覆盖原环境文件中的账号、密码、盐与会话密钥。

```bash
git status --short
git pull --ff-only
lt_compose build learntrack
```

构建失败时原容器仍可运行，不进行下一步。AI 和 GitHub 可选配置参考 [学习工作台说明](study-workspace.md)，使用原环境文件追加即可；无需更换数据卷。

## 5. 更新容器并核对数据

```bash
lt_compose up -d --no-deps learntrack
LT_NEW_CONTAINER=$(lt_compose ps -q learntrack)
docker exec "$LT_NEW_CONTAINER" node -e 'fetch("http://127.0.0.1:8787/api/v1/health").then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))'
lt_compose restart "$LT_PROXY"
lt_compose ps
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_NEW_CONTAINER" > "$LT_SNAPSHOT/mounts-after.txt"
diff -u "$LT_SNAPSHOT/mounts-before.txt" "$LT_SNAPSHOT/mounts-after.txt"
lt_compose logs --tail=80 learntrack "$LT_PROXY"
```

健康检查应返回 `ok: true`、`db: true`；它不能证明历史数据完整。核对数据卷名称、来源与目标一致，再从原访问网址检查服务。

关闭旧标签页后联网重新打开，所有设备更新到新版后再使用新增实体的同步。核对：

- 历史学习记录数、时长、科目颜色及待同步队列保持一致；新科目仍可搜索并保存记录。
- 计划能创建、编辑及生成任务，已完成任务不因调整计划删除；练习与讲次进度刷新后保留。
- 完整 JSON 导出含 `studyPlans`、`practiceAttempts` 和 `courseProgress`。
- 同步先预览最近变化，再确认；首次同步后检查冲突与待上传数。
- 如配置在线功能，分别验证 AI 生成建议后确认加入、GitHub 和力扣账号的真实日历。

如看到空数据或挂载不一致，停止录入并检查项目名、卷、原网址；不要初始化或覆盖原卷。不要在正式浏览器上通过导入备份测试恢复，恢复会替换当前本地数据。

**不要执行** `docker compose down -v`、`docker volume prune` 或删除数据卷。普通更新不需要 `down`，也不需要导入旧备份。

## 6. 回滚限制

浏览器一旦打开新版，就升级到了 IndexedDB 4。旧前端（最高版本 3）不能直接打开升级后的数据库；旧 API 也不认识新增同步实体。数据仍在，但回滚到旧镜像不能保证继续使用或同步。因此新版前端已被使用时，优先修复并发布兼容版本，保留数据卷与各浏览器完整备份，暂停同步。

只有在客户端尚未打开新版，或已准备好匹配的兼容前端/API 时，才使用旧镜像回滚代码：

```bash
cat > "$LT_SNAPSHOT/rollback.override.yml" <<EOF
services:
  learntrack:
    image: $LT_ROLLBACK_IMAGE
EOF
docker compose -p "$LT_PROJECT" --env-file "$LT_ENV" -f "$LT_COMPOSE" -f "$LT_SNAPSHOT/rollback.override.yml" up -d --no-deps --no-build learntrack
lt_compose restart "$LT_PROXY"
```

原部署含其他 override 时仍要带上全部原参数。镜像被清理后可先 `docker image load -i "$LT_SNAPSHOT/old-image.tar.gz"`。回滚镜像仍复用原卷，**不恢复旧数据库**；直接用备份覆盖数据库会丢掉备份之后的记录。

真正恢复数据库是另一项操作：停写、保留故障现场、核对每个设备的未同步数据和具体原卷后再执行。后续发布新版时去掉回滚 override 参数。本方案未在你的 ECS 执行。
