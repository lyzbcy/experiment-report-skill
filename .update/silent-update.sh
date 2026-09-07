#!/usr/bin/env bash
# experiment-report-skill 静默自更新组件
# 规则（「skill 静默更新」组件）：
#   每天首次调用时检查本地版本号(VERSION)与远端版本号；不一致则静默更新；
#   全程自动、无感、不打断本次 skill 使用；任何失败都继续使用旧版本，下次再试。
# 兼容性：纯 Git Bash / Linux / macOS 均可运行，无 git 依赖（走 HTTPS 下载 zip）。
set -u

SCRIPT_FILE="${BASH_SOURCE[0]}"
SKILL_DIR="$(cd "$(dirname "$SCRIPT_FILE")/.." && pwd)"
UPD_DIR="$SKILL_DIR/.update"
REPO="lyzbcy/experiment-report-skill"
BRANCH="master"
RAW_VER="https://raw.githubusercontent.com/$REPO/$BRANCH/VERSION"
RAW_VER_CDN="https://cdn.jsdelivr.net/gh/$REPO@$BRANCH/VERSION"
ZIP_URL="https://codeload.github.com/$REPO/zip/refs/heads/$BRANCH"
STAMP="$UPD_DIR/last_check"

fail() { exit 0; }   # 任何异常：静默退出，继续用旧版本

# --- 每天只检查一次 ---
TODAY="$(date +%F 2>/dev/null)" || fail
if [ -f "$STAMP" ] && [ "$(cat "$STAMP" 2>/dev/null)" = "$TODAY" ]; then
  exit 0
fi
echo "$TODAY" > "$STAMP" 2>/dev/null || fail

LOCAL_VER="$(cat "$SKILL_DIR/VERSION" 2>/dev/null)" || fail
[ -n "$LOCAL_VER" ] || fail

# --- 查远端版本号（raw 不通时走 jsdelivr CDN 兜底）---
REMOTE_VER="$(curl -fsSL --max-time 20 "$RAW_VER" 2>/dev/null | tr -d ' \r\n')"
[ -n "$REMOTE_VER" ] || REMOTE_VER="$(curl -fsSL --max-time 20 "$RAW_VER_CDN" 2>/dev/null | tr -d ' \r\n')"
[ -n "$REMOTE_VER" ] || fail

[ "$REMOTE_VER" = "$LOCAL_VER" ] && exit 0   # 版本一致，无事发生

# --- 版本不一致：先下载并验证新包，成功后才替换；任一步失败即保留旧版 ---
TMP="$(mktemp -d 2>/dev/null)" || fail
trap 'rm -rf "$TMP" 2>/dev/null' EXIT

curl -fsSL --max-time 60 -o "$TMP/skill.zip" "$ZIP_URL" 2>/dev/null || fail
unzip -tqq "$TMP/skill.zip" >/dev/null 2>&1 || fail
unzip -qq "$TMP/skill.zip" -d "$TMP" >/dev/null 2>&1 || fail

SRC="$(find "$TMP" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | head -1)"
[ -n "$SRC" ] && [ -f "$SRC/SKILL.md" ] || fail

# 替换旧版：运行状态(last_check)保留；更新脚本本体放最后换，避免执行中覆盖自己
find "$SKILL_DIR" -mindepth 1 -maxdepth 1 ! -name '.update' -exec rm -rf {} + 2>/dev/null
cp -r "$SRC/." "$SKILL_DIR/" 2>/dev/null || fail
rm -f "$UPD_DIR/silent-update.sh.new" 2>/dev/null
if [ -f "$SRC/.update/silent-update.sh" ]; then
  cp "$SRC/.update/silent-update.sh" "$UPD_DIR/silent-update.sh.new" 2>/dev/null &&
    mv -f "$UPD_DIR/silent-update.sh.new" "$UPD_DIR/silent-update.sh" 2>/dev/null || fail
fi

echo "UPDATED $REMOTE_VER"
exit 0
