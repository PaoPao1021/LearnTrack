# ECS Docker Compose 保留数据更新方案

适用：仓库 `infrastructure/docker/docker-compose.yml` 的部署方式。尚未连接 ECS 核验实际路径、卷名或线上版本；以下在 ECS 的 Bash 中分阶段执行，任一步失败先处理，不继续发布。本次修改前端分类、同步、备份、待办、计时及共享统计逻辑，不改数据库 schema、数据库名称或迁移脚本。

## 1. 先备份每个使用过的浏览器

在原访问地址的设置页导出**完整 JSON 备份**，保存到电脑；CSV 不能恢复完整数据。每个有独立记录的浏览器/设备都要导出，未同步队列也在 JSON 内。记录当前记录数和累计时长，结束正在运行的计时器。更新与验证期间暂停录入。

继续使用相同协议、域名和端口；例如 HTTP 改 HTTPS、IP 改域名都会变成另一个浏览器存储空间。不要清除站点数据、IndexedDB 或重置应用。ECS 数据卷不能代替浏览器备份，尤其是未启用同步时。

## 2. 确认原部署，保存镜像与卷信息

先进入 **ECS 原来的仓库根目录**，不要新建部署目录。下面的容器 ID 从 `docker ps` 查到并手动填写；通过正在运行的容器读取原 Compose 项目名，防止生成新空卷。

```bash
docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Image}}'
```

以下命令在同一个 Bash 会话执行：

```bash
set -euo pipefail
LT_CONTAINER='替换为当前 learntrack 应用容器ID'
LT_PROJECT=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$LT_CONTAINER")
test -n "$LT_PROJECT"
test "$(docker inspect -f '{{index .Config.Labels "com.docker.compose.service"}}' "$LT_CONTAINER")" = learntrack
LT_COMPOSE="$PWD/infrastructure/docker/docker-compose.yml"
test -f "$LT_COMPOSE"
lt_compose() { docker compose -p "$LT_PROJECT" -f "$LT_COMPOSE" "$@"; }
lt_compose ps
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_CONTAINER"
```

核对应用容器与 `lt_compose ps` 一致，挂载目标有 `/data` 和 `/backups`。若原来还用了 override 文件、额外 env 文件或自定义卷，必须把同样参数加入函数，再核对；不要用默认配置覆盖线上自定义配置。

```bash
LT_STAMP=$(date +%Y%m%d-%H%M%S)
LT_SNAPSHOT="$HOME/learntrack-release-backups/$LT_STAMP"
mkdir -p "$LT_SNAPSHOT"
chmod 700 "$LT_SNAPSHOT"
cp .env "$LT_SNAPSHOT/env"
cp "$LT_COMPOSE" "$LT_SNAPSHOT/docker-compose.yml"
cp infrastructure/nginx/nginx.conf "$LT_SNAPSHOT/nginx.conf"
git rev-parse HEAD > "$LT_SNAPSHOT/source-commit.txt"
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_CONTAINER" > "$LT_SNAPSHOT/mounts-before.txt"
LT_OLD_IMAGE=$(docker inspect -f '{{.Image}}' "$LT_CONTAINER")
LT_ROLLBACK_IMAGE="learntrack-rollback:$LT_STAMP"
docker image tag "$LT_OLD_IMAGE" "$LT_ROLLBACK_IMAGE"
docker image save "$LT_ROLLBACK_IMAGE" | gzip > "$LT_SNAPSHOT/old-image.tar.gz"
```

该目录含配置密钥及学习数据，不放进 Git，也不放进网站静态目录。

## 3. 停写后复制 SQLite 数据

为得到一致备份，短暂停止应用容器，复制整个 `/data`（包含可能存在的 SQLite WAL/SHM 文件），而不是运行时只复制 `learntrack.db`。`docker cp` 支持已停止的容器。

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

如果复制或检查失败，先执行 `lt_compose start learntrack` 恢复原服务，停止更新。成功后将备份目录另存到本地或其他存储，避免只在同一台 ECS 留一份。

## 4. 上传完整修复并构建

本地修复包含未跟踪的新文件（`packages/domain/src/tree.ts` 和测试等），单独 `git diff` 不包含它们。发布前将全部所需修改纳入一个明确的 Git 提交并推送；服务器先确认 `git status --short` 无待处理修改，再拉取对应提交。不要执行 `reset --hard` 覆盖服务器改动，也不要替换原 `.env`。

```bash
git status --short
# 确认工作树、分支与目标提交后，执行实际发布仓库的拉取命令。
# 例如在正确分支上：git pull --ff-only
lt_compose build learntrack
```

构建失败时原容器仍然运行，不继续下一步。发布内容应已在本地通过 `npm run build` 和 `npm test`。

## 5. 替换应用，复用原卷

```bash
lt_compose up -d --no-deps learntrack
# Nginx 可能仍缓存旧容器 IP；重启以重新解析 learntrack。
lt_compose restart nginx
lt_compose ps
curl --fail --silent --show-error http://127.0.0.1:8787/api/v1/health
LT_NEW_CONTAINER=$(lt_compose ps -q learntrack)
docker inspect -f '{{range .Mounts}}{{println .Destination .Type .Name .Source}}{{end}}' "$LT_NEW_CONTAINER" > "$LT_SNAPSHOT/mounts-after.txt"
diff -u "$LT_SNAPSHOT/mounts-before.txt" "$LT_SNAPSHOT/mounts-after.txt"
lt_compose logs --tail=80 learntrack nginx
```

健康检查应返回 `ok: true`、`db: true`；健康检查本身不证明历史数据完整，必须核对挂载和浏览器记录。若挂载不同或出现空数据，停止录入并回查项目名、配置与卷，不能初始化或覆盖原卷。

在原网址联网刷新页面，必要时关闭旧标签页后重新打开；不要清除站点数据。验证：历史记录数/时长相同；设置新建科目和编辑已有科目的颜色正常；新科目可搜索并保存记录；给该科目添加活动后科目仍可选择；总览可直接添加待办；统计与 JSON 导出正常。启用同步的设备应先点击“检查同步内容”，核对最近一条变化，再确认同步并检查同步状态。不要在正式浏览器上为测试恢复而导入备份（导入会替换本地数据）。

**不要执行** `docker compose down -v`、`docker volume prune` 或删除 `lt-data`/`lt-backups`。普通更新不需要 `down`，也不需要导入旧备份。

## 6. 回滚代码，保留当前数据

本次无数据库结构变更，应用出错时优先回滚镜像，仍使用原数据卷；不要为了回滚代码覆盖数据库，否则会丢失备份之后的新记录。

在同一 Bash 会话中执行：

```bash
cat > "$LT_SNAPSHOT/rollback.override.yml" <<EOF
services:
  learntrack:
    image: $LT_ROLLBACK_IMAGE
EOF
docker compose -p "$LT_PROJECT" -f "$LT_COMPOSE" -f "$LT_SNAPSHOT/rollback.override.yml" up -d --no-deps --no-build learntrack
lt_compose restart nginx
curl --fail --silent --show-error http://127.0.0.1:8787/api/v1/health
```

若镜像被清理，可先 `docker image load -i "$LT_SNAPSHOT/old-image.tar.gz"`。回滚前后都保留浏览器 JSON；旧版本可能不能正确显示直接挂在科目上的新记录，也可能拒绝导入新版 JSON，这些数据不能因此删除。真正恢复服务器数据库属于另一个操作，应停写并先备份故障现场、核对所有设备未同步数据，再针对确认的原卷恢复。

后续重新发布新版时移除回滚 override 参数。整个方案尚未在你的 ECS 执行。
