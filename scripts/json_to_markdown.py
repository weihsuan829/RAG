"""將 data/json/ 的議案 JSON 轉成乾淨的 Markdown，供 Cloudflare AI Search 索引。

用法： python3 scripts/json_to_markdown.py
輸出： data/markdown/<bill_no>.md
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "json"
DST = ROOT / "data" / "markdown"


def roc_date(s: str) -> str:
    """民國日期字串 1140701 -> 民國114年7月1日"""
    s = (s or "").strip()
    if len(s) != 7 or not s.isdigit():
        return s
    return f"民國{int(s[:3])}年{int(s[3:5])}月{int(s[5:7])}日"


def field(label: str, value: str) -> str:
    value = (value or "").strip()
    return f"- {label}：{value}" if value else ""


def convert(data: dict) -> str:
    lines = [
        f"# 議案 {data.get('bill_no', '')}：{(data.get('reason') or '').strip()}",
        "",
        "## 基本資料",
        field("會期", data.get("mdsl")),
        field("審查會", data.get("examine")),
        field("案號", data.get("caseno")),
        field("議案案別", data.get("billtype")),
        field("類別", data.get("billclass")),
        field("提案人", data.get("provider")),
        field("連署人", data.get("supportman")),
        field("發文日期", roc_date(data.get("comedate", ""))),
        "",
        "## 案由",
        (data.get("reason") or "").strip(),
        "",
        "## 說明",
        (data.get("description") or "").strip(),
    ]

    method = (data.get("method") or "").strip()
    if method:
        lines += ["", "## 辦法", method]

    results = [
        ("第一讀會結果", data.get("oneresult")),
        ("審查會結果", data.get("examresult")),
        ("大會決議", data.get("result")),
        ("第二讀會結果", data.get("tworesult")),
        ("第三讀會結果", data.get("threeresult")),
    ]
    result_lines = [field(label, value) for label, value in results if (value or "").strip()]
    if result_lines:
        lines += ["", "## 審議結果", *result_lines]

    responses = data.get("government_responses") or []
    if responses:
        lines += ["", "## 政府回覆"]
        for i, r in enumerate(responses, 1):
            lines += [
                "",
                f"### 回覆 {i}",
                field("回覆單位", r.get("reply_unit")),
                field("回覆日期", roc_date(r.get("reply_date", ""))),
                field("辦理狀態", r.get("reply_state")),
                "",
                (r.get("reply_content") or "").strip(),
            ]

    return "\n".join(line for line in lines if line is not None) + "\n"


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    count = 0
    for src in sorted(SRC.glob("*.json")):
        data = json.loads(src.read_text(encoding="utf-8"))
        out = DST / f"{src.stem}.md"
        out.write_text(convert(data), encoding="utf-8")
        count += 1
    print(f"轉換完成：{count} 個檔案 -> {DST}")


if __name__ == "__main__":
    main()
