# 網路搜尋備援實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 聊天加 `mode:"web"`：使用者按鈕觸發 OpenAI 網路搜尋回答，與官方資料明確區隔，入庫標記來源。

**Architecture:** 擴充既有 `POST /api/v1/chat`（mode 分流），新模組 `openai_client.py` 以 httpx 串流 OpenAI Responses API（web_search 工具）。SSE 事件型別不變；web 模式順序為 `delta…→citations→done`（來源在生成結束才可得，前端解析本就不依賴順序）。`messages` 表加 `source` 欄位（啟動時自動遷移）。

**Tech Stack:** 既有（FastAPI/httpx/SQLAlchemy/React）；不加新套件。

## Global Constraints

- 後端改動在 `/Users/weihsuan/RAG_new/backend`（獨立 git repo，分支先 `git checkout -b web-fallback`）；前端在 `/Users/weihsuan/RAG_new`（同名分支）。指令：後端 `uv run ...`、前端 `npm run ...`。
- 金鑰不進 git；`OPENAI_API_KEY` 已在 backend/.env。
- TDD：測試→失敗→實作→通過→commit；`uv run ruff check src tests scripts` 乾淨；既有 30 測試不能壞。
- SSE 事件格式逐字 `event: <name>\ndata: <json>\n\n`；error 文案沿用「系統暫時無法取得資料，請稍後再試」。
- spec：docs/superpowers/specs/2026-07-10-web-search-fallback-design.md。

---

### Task 1: OpenAI 客戶端與煙霧腳本（先驗真實 schema）

**Files:**
- Modify: `backend/src/yarag/config.py`、`backend/tests/conftest.py`、`backend/.env.example`
- Create: `backend/src/yarag/openai_client.py`、`backend/scripts/smoke_openai.py`
- Test: `backend/tests/test_openai_client.py`

**Interfaces:**
- Produces: `settings.openai_api_key`（必填）、`settings.openai_model`（預設值見 Step 5）；`async openai_client.stream_web_answer(question: str) -> AsyncIterator[tuple[str, object]]`——依序 yield `("delta", str)`…最後 `("sources", list[dict])`，sources 每項 `{doc_name:str, snippet:str, similarity:0, url:str}`。
- 端點：`POST https://api.openai.com/v1/responses`，`{"model": settings.openai_model, "input": [...], "tools": [{"type": "web_search"}], "stream": true}`，SSE。

- [ ] **Step 1: config 加欄位＋conftest 環境變數**

`config.py` Settings 追加：

```python
    openai_api_key: str = Field(init=False)
    openai_model: str = "gpt-5-mini"
```

`tests/conftest.py` 頂部環境區追加：

```python
os.environ.setdefault("OPENAI_API_KEY", "test-openai-key")
```

- [ ] **Step 2: 失敗測試** `tests/test_openai_client.py`（monkeypatch httpx，不打真網路）：

```python
import httpx
import pytest

from yarag import openai_client

_SSE_LINES = [
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"議會"}',
    '',
    'event: response.output_text.delta',
    'data: {"type":"response.output_text.delta","delta":"改選"}',
    '',
    'event: response.completed',
    'data: {"type":"response.completed","response":{"output":[{"type":"message","content":[{"type":"output_text","text":"議會改選","annotations":[{"type":"url_citation","title":"中央社報導","url":"https://example.com/news"}]}]}]}}',
    '',
]


class _FakeStream:
    def __init__(self, lines):
        self._lines = lines

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    def raise_for_status(self):
        return None

    async def aiter_lines(self):
        for line in self._lines:
            yield line


@pytest.mark.anyio
async def test_stream_web_answer_yields_deltas_then_sources(monkeypatch):
    def fake_stream(self, method, url, **kwargs):
        assert "/responses" in url
        assert kwargs["json"]["tools"] == [{"type": "web_search"}]
        return _FakeStream(_SSE_LINES)

    monkeypatch.setattr(httpx.AsyncClient, "stream", fake_stream)
    events = [e async for e in openai_client.stream_web_answer("最近議會改選？")]
    assert events[0] == ("delta", "議會")
    assert events[1] == ("delta", "改選")
    kind, sources = events[-1]
    assert kind == "sources"
    assert sources == [
        {"doc_name": "中央社報導", "snippet": "議會改選", "similarity": 0, "url": "https://example.com/news"}
    ]


@pytest.mark.anyio
async def test_stream_web_answer_tolerates_unknown_events(monkeypatch):
    lines = ['event: response.created', 'data: {"type":"response.created"}', '', *_SSE_LINES]

    def fake_stream(self, method, url, **kwargs):
        return _FakeStream(lines)

    monkeypatch.setattr(httpx.AsyncClient, "stream", fake_stream)
    events = [e async for e in openai_client.stream_web_answer("q")]
    assert ("delta", "議會") in events and events[-1][0] == "sources"
```

- [ ] **Step 3: 確認失敗** → `uv run pytest tests/test_openai_client.py -v` FAIL
- [ ] **Step 4: 實作** `src/yarag/openai_client.py`：

```python
import json
from collections.abc import AsyncIterator

import httpx

from yarag.config import settings

_URL = "https://api.openai.com/v1/responses"
_SYSTEM = (
    "你是新北市教育局系統的網路搜尋助理。以繁體中文回答，"
    "內容為網路公開資訊、非官方資料；請附上資訊來源。"
)


def _extract_sources(payload: dict) -> list[dict]:
    sources: list[dict] = []
    response = payload.get("response") or {}
    for item in response.get("output") or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            text = content.get("text") or ""
            for ann in content.get("annotations") or []:
                if ann.get("type") == "url_citation":
                    sources.append(
                        {
                            "doc_name": ann.get("title") or ann.get("url") or "網路來源",
                            "snippet": text[:200],
                            "similarity": 0,
                            "url": ann.get("url") or "",
                        }
                    )
    return sources


async def stream_web_answer(question: str) -> AsyncIterator[tuple[str, object]]:
    body = {
        "model": settings.openai_model,
        "input": [
            {"role": "system", "content": _SYSTEM},
            {"role": "user", "content": question},
        ],
        "tools": [{"type": "web_search"}],
        "stream": True,
    }
    headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", _URL, headers=headers, json=body) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    payload = json.loads(line[6:])
                except json.JSONDecodeError:
                    continue
                if not isinstance(payload, dict):
                    continue
                kind = payload.get("type")
                if kind == "response.output_text.delta":
                    delta = payload.get("delta") or ""
                    if delta:
                        yield ("delta", delta)
                elif kind == "response.completed":
                    yield ("sources", _extract_sources(payload))
```

- [ ] **Step 5: 確認通過** → PASS；既有測試不壞（`uv run pytest -q`）
- [ ] **Step 6: 煙霧腳本** `scripts/smoke_openai.py`：

```python
"""對真 OpenAI 問一題。用法：uv run python scripts/smoke_openai.py "最近的教育新聞？" """

import asyncio
import sys

from yarag import openai_client


async def main() -> None:
    question = sys.argv[1] if len(sys.argv) > 1 else "台灣最近的教育政策新聞？"
    async for kind, value in openai_client.stream_web_answer(question):
        if kind == "delta":
            print(value, end="", flush=True)
        else:
            print("\n=== 來源 ===")
            for s in value:
                print(f"- {s['doc_name']}: {s['url']}")


asyncio.run(main())
```

**執行它**（金鑰已在 .env）：`uv run python scripts/smoke_openai.py "台灣最近的教育政策新聞？"`。若事件名稱/欄位與假設不符（delta 事件名、annotations 結構、模型名不存在等），**以真實回應為準修正實作與測試**；若 `gpt-5-mini` 不存在，改用 `/v1/models` 清單中可用的低成本搜尋模型並同步改 config 預設值。把最終使用的模型名寫進 `.env.example`（`OPENAI_MODEL` 示例）與報告。

- [ ] **Step 7: `.env.example` 追加** `OPENAI_API_KEY`（佔位）與 `OPENAI_MODEL`（實測可用值）
- [ ] **Step 8: Commit** `git commit -m "feat: openai web-search client with smoke script"`

---

### Task 2: Message.source 欄位與啟動遷移

**Files:**
- Modify: `backend/src/yarag/models.py`、`backend/src/yarag/db.py`、`backend/src/yarag/threads.py`
- Test: `backend/tests/test_migration.py`、`tests/test_threads.py`（加 source 斷言）

**Interfaces:**
- Produces: `Message.source: str`（預設 `"kb"`，String(10)）；`db.init_db()` 對既有無 source 欄的 messages 表自動 `ALTER TABLE ... ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'kb'`；`GET /threads/{id}` 的 MessageOut 加 `source: str`。

- [ ] **Step 1: 失敗測試** `tests/test_migration.py`：

```python
from sqlalchemy import inspect, text

from yarag.db import Base, engine, init_db


def test_source_column_added_to_legacy_table():
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE messages (id INTEGER PRIMARY KEY, thread_id VARCHAR(36), role VARCHAR(10), content TEXT, citations TEXT, created_at DATETIME)"))
    init_db()
    cols = {c["name"] for c in inspect(engine).get_columns("messages")}
    assert "source" in cols
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO messages (thread_id, role, content) VALUES ('t', 'user', 'x')"))
        row = conn.execute(text("SELECT source FROM messages")).fetchone()
    assert row[0] == "kb"
```

`tests/test_threads.py` 的 `test_get_thread_with_citations` 追加斷言：`assert msgs[0]["source"] == "kb"`。

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作**：`models.py` Message 加 `source: Mapped[str] = mapped_column(String(10), default="kb")`；`db.py` 的 `init_db()` 在 `create_all` 後加：

```python
    from sqlalchemy import inspect, text

    columns = {c["name"] for c in inspect(engine).get_columns("messages")}
    if "source" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE messages ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'kb'"))
```

`threads.py` MessageOut 加 `source: str`，建構處帶 `source=m.source`。

- [ ] **Step 4: 全測試通過**；**Step 5: Commit** `git commit -m "feat: message source column with startup migration"`

---

### Task 3: chat mode 分流

**Files:**
- Modify: `backend/src/yarag/chat.py`
- Test: `backend/tests/test_chat.py`（追加 web 模式測試）

**Interfaces:**
- Produces: `ChatRequest.mode: Literal["kb","web"] = "kb"`；web 模式事件序 `delta…→citations→done`，`done` data 為 `{thread_id, message_id, source}`（kb 模式也加 source="kb"）；web 模式不呼叫 cloudflare、僅送當前問題給 openai_client；assistant 訊息以 `source="web"`、citations=sources JSON 入庫。
- Consumes: Task 1 `openai_client.stream_web_answer`、Task 2 `Message.source`。

- [ ] **Step 1: 失敗測試** 追加到 `tests/test_chat.py`：

```python
def _patch_openai(monkeypatch, deltas=("網路", "答案"), sources=None):
    from yarag import chat

    if sources is None:
        sources = [{"doc_name": "新聞A", "snippet": "…", "similarity": 0, "url": "https://n.example/a"}]

    async def fake_web(question):
        for d in deltas:
            yield ("delta", d)
        yield ("sources", sources)

    monkeypatch.setattr(chat.openai_client, "stream_web_answer", fake_web)


def test_web_mode_event_order_and_source(client, auth_headers, monkeypatch):
    _patch_openai(monkeypatch)

    from yarag import chat

    async def boom(query):
        raise AssertionError("web 模式不得呼叫 cloudflare")

    monkeypatch.setattr(chat.cloudflare, "search", boom)
    r = client.post(
        "/api/v1/chat",
        json={"message": "資料庫沒有的問題", "thread_id": None, "mode": "web"},
        headers=auth_headers,
    )
    events = _parse_sse(r.text)
    names = [e[0] for e in events]
    assert names == ["delta", "delta", "citations", "done"]
    assert events[-1][1]["source"] == "web"
    tid = events[-1][1]["thread_id"]
    detail = client.get(f"/api/v1/threads/{tid}", headers=auth_headers).json()
    assert detail["messages"][1]["source"] == "web"
    assert detail["messages"][1]["citations"][0]["url"] == "https://n.example/a"


def test_kb_mode_unchanged_with_source(client, auth_headers, monkeypatch):
    _patch_cloudflare(monkeypatch)
    r = client.post(
        "/api/v1/chat", json={"message": "尖山國中？", "thread_id": None}, headers=auth_headers
    )
    events = _parse_sse(r.text)
    assert [e[0] for e in events] == ["citations", "delta", "delta", "done"]
    assert events[-1][1]["source"] == "kb"


def test_invalid_mode_rejected(client, auth_headers):
    r = client.post(
        "/api/v1/chat", json={"message": "x", "thread_id": None, "mode": "magic"}, headers=auth_headers
    )
    assert r.status_code == 422
```

- [ ] **Step 2: 確認失敗** → FAIL
- [ ] **Step 3: 實作** `chat.py`：import `from typing import Literal` 與 `from yarag import openai_client`；`ChatRequest` 加 `mode: Literal["kb", "web"] = "kb"`；`generate()` 分流：

```python
    async def generate():
        try:
            if req.mode == "web":
                full_text = ""
                citations: list[dict] = []
                async for kind, value in openai_client.stream_web_answer(req.message):
                    if kind == "delta":
                        full_text += value
                        yield _sse("delta", {"text": value})
                    elif kind == "sources":
                        citations = value
                        yield _sse("citations", citations)
            else:
                citations = await cloudflare.search(req.message)
                yield _sse("citations", citations)
                full_text = ""
                messages = [*history, {"role": "user", "content": req.message}]
                async for delta in cloudflare.stream_chat(messages):
                    full_text += delta
                    yield _sse("delta", {"text": delta})
            assistant = Message(
                thread_id=thread_id,
                role="assistant",
                content=full_text,
                citations=json.dumps(citations, ensure_ascii=False),
                source=req.mode,
            )
            db.add(assistant)
            db.query(Thread).filter(Thread.id == thread_id).update({"updated_at": datetime.now(UTC)})
            db.commit()
            yield _sse("done", {"thread_id": thread_id, "message_id": assistant.id, "source": req.mode})
        except Exception:
            logger.exception("chat stream failed", extra={"thread_id": thread_id})
            yield _sse("error", {"message": "系統暫時無法取得資料，請稍後再試"})
```

（既有的使用者訊息入庫、updated_at bump、404 檢查等前置區塊不動；上述僅替換 generate 內部。）

- [ ] **Step 4: 全測試通過**（既有 kb 測試需同步容忍 done 多了 source 欄位——若原測試用全等比對，改為子集斷言）；**Step 5: Commit** `git commit -m "feat: chat mode branching (kb/web) with source tracking"`

---

### Task 4: 前端服務層與型別

**Files:**
- Modify: `frontend/src/edu-rag/services/api.ts`、`frontend/src/edu-rag/utils/uploadStore.ts`（Message/Citation 型別若在此）

**Interfaces:**
- Produces: `streamChat(message, threadId, handlers, mode: 'kb' | 'web' = 'kb')`——body 帶 mode；`Citation` 加 `url?: string`；`ApiMessage` 加 `source: 'kb' | 'web'`；`StreamHandlers.onDone` meta 加 `source`。前端 UI 型別 `Message` 加 `source?: 'kb' | 'web'`、其 `Citation` 加 `url?: string`。
- 驗證：`npm run build` 綠。

- [ ] **Step 1: 實作**：`api.ts` 的 `streamChat` 簽名加第四參數並放進 body `JSON.stringify({ message, thread_id: threadId, mode })`；型別擴充如上。UI 型別（uploadStore.ts 的 Message/Citation）加選填欄位。
- [ ] **Step 2: `npm run build`** 綠（此時尚無呼叫端傳 mode，預設值保相容）
- [ ] **Step 3: Commit**（RAG_new repo）`git commit -m "feat: api service supports web mode and source metadata"`

---

### Task 5: 聊天 UI——網路搜尋按鈕與樣式區隔

**Files:**
- Modify: `frontend/src/edu-rag/components/ChatWindow.tsx`、`frontend/src/edu-rag/pages/EduRagChatPage.tsx`

**Interfaces:**
- Consumes: Task 4 的 streamChat mode 參數與 source 型別。
- 行為契約：
  1. 每則 assistant 訊息（非串流中、非錯誤文案）下方顯示「🌐 用網路搜尋補充」按鈕
  2. 點擊：取該 assistant 訊息**前一則 user 訊息的內容**，以 `mode:'web'` 走與 handleSend 相同的流程（新增 user 訊息氣泡＋assistant 佔位＋streamChat），存入同一 thread
  3. web 來源的 assistant 訊息：不同底色（如 amber 系）＋訊息頂部「🌐 網路資訊，僅供參考」標籤；citations 有 `url` 時渲染 `<a href target="_blank" rel="noopener">`
  4. 判斷 web 樣式的依據：新訊息用 onDone 的 `source`／發送時已知的 mode；歷史訊息用 `fetchThread` 回傳的 `m.source`（EduRagChatPage 映射處帶入）
  5. user 訊息氣泡不需標記

- [ ] **Step 1: 實作**（實作者先讀兩檔現行結構；沿用 threadIdAtSend / latestCitations 既有模式，發送函式抽共用參數 mode）
- [ ] **Step 2: `npm run build`** 綠
- [ ] **Step 3: Commit** `git commit -m "feat: web-search fallback button with visual distinction"`

---

### Task 6: 端對端驗收

- [ ] **Step 1: 自動化**：`cd backend && uv run pytest -q` 全綠、ruff 乾淨；`cd frontend && npm run build` 綠
- [ ] **Step 2: 煙霧**：`uv run python scripts/smoke_openai.py "台灣最近的教育政策新聞？"` 有答案有來源
- [ ] **Step 3: 人工清單**（真瀏覽器）：
  1. 問「新北市的垃圾清運政策是什麼？」（kb 模式誠實說找不到）
  2. 按「🌐 用網路搜尋補充」→ 出現網路樣式回答＋「僅供參考」標籤＋可點來源連結
  3. 重新整理 → 網路訊息仍以網路樣式顯示（source 持久化）
  4. kb 回答樣式與行為與改版前無差異
  5. 竄改 mode 送出（curl mode:"magic"）→ 422
- [ ] **Step 4: 合併**：兩 repo 測試綠後 merge web-fallback → 主分支，刪分支

---

## Self-Review 紀錄

- Spec 覆蓋：mode API（T3）、openai 客戶端與模型設定（T1）、source 欄位與遷移（T2）、前端按鈕/樣式/連結（T4/T5）、錯誤沿用（T3 generate except）、煙霧（T1/T6）、端對端（T6）——全對應。
- 型別一致：`stream_web_answer` yield 契約在 T1 定義、T3 消費；`source` 欄位 T2 定義、T3 寫入、T4/T5 消費；citations url 欄位 T1 產生、T4 型別、T5 渲染。
- 已知不確定點（外部依賴，T1 Step 6 以煙霧實測校正）：Responses API 的串流事件名與 annotations 結構、可用模型名。
