#!/usr/bin/env bash
# LearnTrack 电脑端备份拉取脚本
# 登录时及每 6 小时由 LaunchAgent 调用；也可手动运行。
# 需要只读备份凭据：LT_BACKUP_USER / LT_BACKUP_PASSWORD（服务端可另行配置只读账号）。
set -euo pipefail

SERVER_URL="${LT_SERVER_URL:-https://your-domain.example}"
DEST_DIR="${LT_BACKUP_DEST:-$HOME/Documents/StudyTrackerBackups}"
KEEP=30

mkdir -p "$DEST_DIR"

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# 1. 登录（使用只读凭据）
curl -fsS -c "$TMP/cookies.txt" -X POST "$SERVER_URL/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${LT_BACKUP_USER:?missing LT_BACKUP_USER}\",\"password\":\"${LT_BACKUP_PASSWORD:?missing LT_BACKUP_PASSWORD}\"}" > /dev/null

# 2. 生成新的服务器备份并获取文件名
META=$(curl -fsS -b "$TMP/cookies.txt" "$SERVER_URL/api/v1/backups")
FILE=$(echo "$META" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["fileName"])')
CHECKSUM=$(echo "$META" | /usr/bin/python3 -c 'import sys,json;print(json.load(sys.stdin)["checksum"])')

# 3. 下载
ZIP_PATH="$DEST_DIR/$FILE"
curl -fsS -b "$TMP/cookies.txt" -o "$ZIP_PATH" "$SERVER_URL/api/v1/backups/$FILE"

# 4. 校验（zip 内 data.json 的 sha256 与 manifest 中的 checksum 一致）
ACTUAL=$(unzip -p "$ZIP_PATH" data.json | shasum -a 256 | awk '{print $1}')
if [ "$ACTUAL" != "$CHECKSUM" ]; then
  echo "校验失败，删除损坏的备份：$ZIP_PATH"
  rm -f "$ZIP_PATH"
  exit 1
fi

# 5. 记录保存时间（应用设置页会读取该文件）
date -u +%Y-%m-%dT%H:%M:%SZ > "$DEST_DIR/.last_computer_backup_at"

# 6. 只保留最近 KEEP 份
ls -t "$DEST_DIR"/learntrack-backup-*.zip 2>/dev/null | tail -n +$((KEEP + 1)) | xargs rm -f 2>/dev/null || true

echo "备份完成：$ZIP_PATH"
