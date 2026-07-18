#!/usr/bin/env bash
# 產出某期間的開發紀錄，作為撰寫進度報告的素材。
#
# 用法：  ./scripts/report-data.sh 2026-07-19 2026-07-31
#         ./scripts/report-data.sh 2026-07-19 2026-07-31 > docs/素材_0719-0731.txt
#
# 產出：兩個 repo（前端 RAG_new、後端 backend）的提交紀錄、統計、與後端測試數。
set -euo pipefail

START="${1:-}"
END="${2:-}"
if [ -z "$START" ] || [ -z "$END" ]; then
  echo "用法: $0 <起日 YYYY-MM-DD> <迄日 YYYY-MM-DD>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND="$ROOT/backend"
# git 的 --until 不含當日，故推進一天讓迄日被包含
UNTIL="$(date -j -v+1d -f %Y-%m-%d "$END" +%Y-%m-%d 2>/dev/null || echo "$END")"

section() { printf '\n═══ %s ═══\n' "$1"; }

echo "進度報告素材：$START ~ $END"

section "前端（RAG_new）提交"
git -C "$ROOT" log --since="$START" --until="$UNTIL" --date=short --pretty='%ad  %s' || true

section "後端（backend）提交"
git -C "$BACKEND" log --since="$START" --until="$UNTIL" --date=short --pretty='%ad  %s' || true

section "統計"
FE=$(git -C "$ROOT" log --since="$START" --until="$UNTIL" --oneline | wc -l | tr -d ' ')
BE=$(git -C "$BACKEND" log --since="$START" --until="$UNTIL" --oneline | wc -l | tr -d ' ')
echo "前端提交數：$FE"
echo "後端提交數：$BE"
echo "合計：$((FE + BE))"

if command -v uv >/dev/null 2>&1; then
  TESTS=$(cd "$BACKEND" && uv run pytest -q 2>&1 | grep -oE '[0-9]+ passed' || echo '未取得')
  echo "後端測試：$TESTS"
fi
echo "已索引議案：$(ls "$ROOT/data/markdown" 2>/dev/null | wc -l | tr -d ' ') 筆"

section "改動較多的檔案（前 15）"
{
  git -C "$ROOT" log --since="$START" --until="$UNTIL" --name-only --pretty=format: || true
  git -C "$BACKEND" log --since="$START" --until="$UNTIL" --name-only --pretty=format: || true
} | grep -v '^$' | sort | uniq -c | sort -rn | head -15

printf '\n提示：把上面內容整理成階段與功能卡片，填入 docs/report-template.html\n'
