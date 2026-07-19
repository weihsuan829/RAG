#!/usr/bin/env python3
"""檢索品質評測：固定題組，用於比較 AI Search 設定變更前後的效果。

用法（於 backend 目錄，需載入 .env）：
    cd backend && set -a && . ./.env && set +a && uv run --no-sync python ../scripts/eval_retrieval.py [標籤]

「標籤」用來標示本次是哪組設定（例如 baseline、rewrite_on），會顯示在報表標題。

指標：
  命中率 = 目標文件出現在回傳結果中的比例
  平均排名 = 命中時的平均名次（越小越好）

編號題檢驗「用句子問特定議案編號」是否找得到；
語意題為對照組，確認調整未損害既有的語意檢索能力。
"""
import os
import sys

import httpx

# 編號查詢題：10 筆議案，以自然語句詢問
NUMBER_QUERIES = [
    ("31605", "議案31605的內容是什麼"),
    ("31207", "議案31207的內容是什麼"),
    ("32592", "議案32592的內容是什麼"),
    ("32441", "議案32441的內容是什麼"),
    ("32430", "議案32430的內容是什麼"),
    ("31625", "議案31625的內容是什麼"),
    ("31600", "議案31600的內容是什麼"),
    ("34116", "議案34116的內容是什麼"),
    ("31586", "議案31586的內容是什麼"),
    ("34619", "議案34619 討論內容是什麼"),
]

# 語意查詢題：對照組，確認語意檢索能力未退步
SEMANTIC_QUERIES = [
    ("34619", "安坑國小開放夜間運動時段"),
    ("32592", "蘆洲成功國小風雨操場"),
    ("31586", "國中小全面免費營養午餐"),
    ("31605", "校園法治教育杜絕霸凌"),
    ("32441", "五華國小校園廣播音響系統"),
]


def search(url: str, token: str, query: str) -> list[str]:
    resp = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}"},
        json={"messages": [{"role": "user", "content": query}]},
        timeout=60,
    )
    resp.raise_for_status()
    chunks = (resp.json().get("result") or {}).get("chunks") or []
    return [(c.get("item") or {}).get("key", "") for c in chunks]


def run(label: str) -> None:
    acct = os.environ["CF_ACCOUNT_ID"]
    token = os.environ["CF_API_TOKEN"]
    inst = os.environ["CF_AI_SEARCH_INSTANCE"]
    url = f"https://api.cloudflare.com/client/v4/accounts/{acct}/ai-search/instances/{inst}/search"

    print(f"\n{'=' * 62}")
    print(f"檢索評測：{label}")
    print("=" * 62)

    summary = {}
    for name, cases in (("編號查詢", NUMBER_QUERIES), ("語意查詢", SEMANTIC_QUERIES)):
        print(f"\n── {name} ──")
        ranks = []
        for bill_id, query in cases:
            keys = search(url, token, query)
            hit = next((i + 1 for i, k in enumerate(keys) if f"bills/{bill_id}.md" == k), None)
            ranks.append(hit)
            mark = "✅" if hit else "❌"
            print(f"  {mark} {query:<28} → {('第 ' + str(hit) + ' 名') if hit else '未命中'}")
        hits = [r for r in ranks if r]
        rate = len(hits) / len(ranks) * 100
        avg = sum(hits) / len(hits) if hits else 0
        summary[name] = (rate, avg, len(hits), len(ranks))
        print(f"  命中率 {rate:.0f}% ({len(hits)}/{len(ranks)})" + (f"、平均排名 {avg:.1f}" if hits else ""))

    print(f"\n{'─' * 62}")
    for name, (rate, avg, h, t) in summary.items():
        print(f"{name}：命中率 {rate:.0f}% ({h}/{t})" + (f"、平均排名 {avg:.1f}" if h else ""))
    print()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "未命名")
