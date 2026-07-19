# 議案編號直查 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** 使用者以議案編號提問時，後端直接取出該議案文件並注入 AI 的參考內容，確保回答正確且出處正確。

**Architecture:** 於 `chat.py` 的 kb 分支，在呼叫 Cloudflare 之前先辨識問題中的議案編號、自 R2 取出對應文件。取得的文件同時（a）置於 `citations` 首位供前端顯示，（b）注入送往 `cloudflare.stream_chat` 的訊息中，因為答案由 Cloudflare 內部檢索生成，僅改 citations 無法改變答案內容。語意檢索維持不變，兩者並行。

**Tech Stack:** FastAPI、boto3（R2）、httpx、pytest。

## Global Constraints

- 後端為獨立 git repo（`backend/`），測試 `uv run pytest`、lint `uv run ruff check src tests`。
- **不得破壞既有行為**：問題中沒有議案編號時，流程與現況完全相同。
- 議案檔案路徑格式固定為 `bills/{編號}.md`。
- 單次最多注入 3 筆議案，避免提示詞過長。
- 所有既有測試必須持續通過。

---

### Task 1: 議案編號辨識與取檔模組

**Files:**
- Create: `backend/src/yarag/bills.py`
- Test: `backend/tests/test_bills.py`

**Interfaces:**
- Produces:
  - `extract_bill_ids(text: str) -> list[str]`：抓出 4–6 位數字，去重且保留出現順序
  - `fetch_bill(bill_id: str) -> str | None`：讀 `bills/{bill_id}.md`，不存在回 None

- [ ] **Step 1: 寫失敗測試**

建立 `backend/tests/test_bills.py`：

```python
import pytest


def test_extract_single_id():
    from yarag.bills import extract_bill_ids

    assert extract_bill_ids("議案34619的內容是什麼") == ["34619"]


def test_extract_multiple_ids_dedup_and_order():
    from yarag.bills import extract_bill_ids

    assert extract_bill_ids("比較 34619 和 33835，還有 34619") == ["34619", "33835"]


def test_extract_none_when_no_number():
    from yarag.bills import extract_bill_ids

    assert extract_bill_ids("校園霸凌相關議案有哪些") == []


def test_extract_ignores_too_short_or_long():
    from yarag.bills import extract_bill_ids

    assert extract_bill_ids("有 12 間教室與 1234567 號") == []


def test_fetch_bill_returns_content(monkeypatch):
    from yarag import bills

    class _S3:
        def get_object(self, Bucket, Key):
            assert Key == "bills/34619.md"
            return {"Body": type("B", (), {"read": lambda self: "議案內容".encode()})()}

    monkeypatch.setattr(bills, "s3_client", _S3())
    assert bills.fetch_bill("34619") == "議案內容"


def test_fetch_bill_returns_none_when_missing(monkeypatch):
    from yarag import bills

    class _S3:
        def get_object(self, Bucket, Key):
            raise RuntimeError("NoSuchKey")

    monkeypatch.setattr(bills, "s3_client", _S3())
    assert bills.fetch_bill("99999") is None
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_bills.py -v`
Expected: FAIL（`ModuleNotFoundError: No module named 'yarag.bills'`）

- [ ] **Step 3: 實作模組**

建立 `backend/src/yarag/bills.py`：

```python
import logging
import re

from yarag.config import settings
from yarag.uploads import s3_client

logger = logging.getLogger("uvicorn")

_BILL_ID_RE = re.compile(r"(?<!\d)\d{4,6}(?!\d)")
MAX_BILLS = 3


def extract_bill_ids(text: str) -> list[str]:
    seen: list[str] = []
    for match in _BILL_ID_RE.findall(text):
        if match not in seen:
            seen.append(match)
    return seen


def fetch_bill(bill_id: str) -> str | None:
    key = f"bills/{bill_id}.md"
    try:
        obj = s3_client.get_object(Bucket=settings.default_bucket, Key=key)
        return obj["Body"].read().decode("utf-8")
    except Exception:
        return None  # 不存在或讀取失敗：視為非議案編號，走原流程
```

- [ ] **Step 4: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_bills.py -v`
Expected: PASS（6 tests）

- [ ] **Step 5: 提交**

```bash
cd backend && git add src/yarag/bills.py tests/test_bills.py && \
git commit -m "feat: 議案編號辨識與取檔模組"
```

---

### Task 2: 聊天流程注入議案內容

**Files:**
- Modify: `backend/src/yarag/chat.py`
- Test: `backend/tests/test_chat.py`

**Interfaces:**
- Consumes: `bills.extract_bill_ids`、`bills.fetch_bill`、`bills.MAX_BILLS`（Task 1）
- Produces：kb 模式下，若問題含存在的議案編號，`citations` 首位為該議案，且送往 `stream_chat` 的最後一則訊息含該議案全文。

- [ ] **Step 1: 寫失敗測試**

在 `backend/tests/test_chat.py` 末尾新增：

```python
def _patch_bills(monkeypatch, available: dict[str, str]):
    from yarag import chat

    monkeypatch.setattr(chat.bills, "fetch_bill", lambda bid: available.get(bid))


def test_bill_number_injects_content_into_prompt(client, auth_headers, monkeypatch):
    from yarag import chat

    _patch_cloudflare(monkeypatch)
    _patch_bills(monkeypatch, {"34619": "# 議案 34619：安坑國小開放夜間運動時段"})
    captured = {}

    async def fake_stream(messages):
        captured["messages"] = messages
        yield "答案"

    monkeypatch.setattr(chat.cloudflare, "stream_chat", fake_stream)
    r = client.post("/api/v1/chat", json={"message": "議案34619的內容是什麼"}, headers=auth_headers)
    assert r.status_code == 200
    last = captured["messages"][-1]["content"]
    assert "安坑國小開放夜間運動時段" in last  # 議案全文已注入
    assert "議案34619的內容是什麼" in last  # 原問題保留


def test_bill_number_prepends_citation(client, auth_headers, monkeypatch):
    from yarag import chat

    _patch_cloudflare(monkeypatch)
    _patch_bills(monkeypatch, {"34619": "# 議案 34619：安坑國小開放夜間運動時段"})
    body = client.post("/api/v1/chat", json={"message": "議案34619的內容是什麼"}, headers=auth_headers).text
    citations_line = next(li for li in body.split("\n") if li.startswith("data: ["))
    assert "bills/34619.md" in citations_line


def test_unknown_bill_number_keeps_original_flow(client, auth_headers, monkeypatch):
    from yarag import chat

    _patch_cloudflare(monkeypatch)
    _patch_bills(monkeypatch, {})  # 該編號不存在
    captured = {}

    async def fake_stream(messages):
        captured["messages"] = messages
        yield "答案"

    monkeypatch.setattr(chat.cloudflare, "stream_chat", fake_stream)
    client.post("/api/v1/chat", json={"message": "議案99999的內容"}, headers=auth_headers)
    assert captured["messages"][-1]["content"] == "議案99999的內容"  # 未加工


def test_no_bill_number_keeps_original_flow(client, auth_headers, monkeypatch):
    from yarag import chat

    _patch_cloudflare(monkeypatch)
    captured = {}

    async def fake_stream(messages):
        captured["messages"] = messages
        yield "答案"

    monkeypatch.setattr(chat.cloudflare, "stream_chat", fake_stream)
    client.post("/api/v1/chat", json={"message": "校園霸凌相關議案"}, headers=auth_headers)
    assert captured["messages"][-1]["content"] == "校園霸凌相關議案"  # 行為不變
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_chat.py -k bill -v`
Expected: FAIL（`AttributeError: module 'yarag.chat' has no attribute 'bills'`）

- [ ] **Step 3: 實作**

3a. `backend/src/yarag/chat.py` 匯入區加入 `bills`：

```python
from yarag import bills, cloudflare, openai_client
```

3b. 在 `_sse` 函式之後新增輔助函式：

```python
def _direct_bills(question: str) -> list[tuple[str, str]]:
    """辨識問題中的議案編號並取出存在的文件（最多 MAX_BILLS 筆）。"""
    found: list[tuple[str, str]] = []
    for bill_id in bills.extract_bill_ids(question):
        if len(found) >= bills.MAX_BILLS:
            break
        content = bills.fetch_bill(bill_id)
        if content:
            found.append((bill_id, content))
    return found


def _augment(question: str, docs: list[tuple[str, str]]) -> str:
    """把議案全文置於問題之前，確保生成階段一定看得到。"""
    if not docs:
        return question
    blocks = "\n\n".join(f"【議案 {bid} 全文】\n{content}" for bid, content in docs)
    return f"{blocks}\n\n---\n請依據上列議案全文回答以下問題：\n{question}"
```

3c. 把 kb 分支（現為 `citations = await cloudflare.search(req.message)` 起的區塊）改為：

```python
            else:
                direct = _direct_bills(req.message)
                citations = await cloudflare.search(req.message)
                for bill_id, content in reversed(direct):
                    citations.insert(
                        0,
                        {
                            "doc_name": f"bills/{bill_id}.md",
                            "snippet": content[:200],
                            "similarity": 1.0,
                        },
                    )
                yield _sse("citations", citations)
                full_text = ""
                messages = [*history, {"role": "user", "content": _augment(req.message, direct)}]
                async for delta in cloudflare.stream_chat(messages):
                    full_text += delta
                    yield _sse("delta", {"text": delta})
```

- [ ] **Step 4: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_chat.py -v`
Expected: PASS（含既有測試）

- [ ] **Step 5: 全套測試與 lint**

Run: `cd backend && uv run pytest && uv run ruff check src tests`
Expected: 全綠

- [ ] **Step 6: 提交**

```bash
cd backend && git add src/yarag/chat.py tests/test_chat.py && \
git commit -m "feat: 議案編號直查——注入議案全文與出處"
```

---

### Task 3: 端對端驗收

**Files:** 無（驗證）

- [ ] **Step 1: 重建 dev 後端**

Run: `cd /Users/weihsuan/RAG_new && docker compose -f docker-compose.dev.yml up -d --force-recreate backend`

- [ ] **Step 2: 以真實聊天 API 測 10 題編號查詢**

透過 `POST /api/v1/chat` 詢問 `議案{編號}的內容是什麼`（10 筆：31605、31207、32592、32441、32430、31625、31600、34116、31586、34619），檢查回答是否包含該議案的實際主題關鍵字、且 citations 含 `bills/{編號}.md`。
Expected: 10/10 正確（目標 ≥90%）

- [ ] **Step 3: 迴歸測試——語意查詢不受影響**

以 5 題內容型問題（如「安坑國小開放夜間運動時段」）詢問，確認回答與出處仍正確。
Expected: 5/5 正確

- [ ] **Step 4: 邊界情況**

詢問「議案99999的內容」（不存在）與「114年度有哪些議案」（數字非編號），確認不會誤觸發、行為正常。
