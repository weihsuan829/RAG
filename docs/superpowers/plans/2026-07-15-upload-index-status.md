# 上傳索引狀態與自動同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 文件列表即時顯示每份檔的 AI Search 索引狀態（索引中／可查詢／無可讀內容／索引失敗），並在上傳完成後自動觸發同步。

**Architecture:** 後端合併「R2 物件清單」與 Cloudflare AI Search `/items` 的單檔狀態，對 pdf/docx/xlsx 的已完成檔再以檢索判斷有無可讀內容（checksum 快取進 DB）。上傳完成後前端呼叫新的 `POST /documents/sync`（後端用高權限 sync token 打 `POST /jobs`），並輪詢文件清單直到全部離開「索引中」。

**Tech Stack:** FastAPI、SQLAlchemy(SQLite)、httpx、pydantic-settings、React 19 + TypeScript + Vite + Tailwind。

## Global Constraints

- 後端（`backend/`）是**獨立 git repo**；前端在 RAG_new 根 repo 的 `frontend/`。提交時各自 commit。
- 後端測試：`cd backend && uv run pytest`；lint：`uv run ruff check src tests`。
- 前端無單元測試框架，型別檢查＋建置以 `cd frontend && npm run build` 為準，行為以瀏覽器手動驗證。
- Cloudflare AI Search 實例 base：`https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/ai-search/instances/{cf_ai_search_instance}`（`cloudflare.py` 既有的 `_url()` 已產生此 base）。
- 兩把 token：查詢用 `settings.cf_api_token`（讀 `/items`、`/search`）；同步用 `settings.cf_sync_api_token`（寫 `/jobs`，AI Search Edit 權限），sync token 僅後端使用。
- `index_status` 契約值固定為 `"indexing" | "ready" | "empty" | "failed"`。
- 狀態徽章純文字＋顏色，**不使用 emoji/icon**。
- `.env` 不進 git；密鑰不寫進任何文件。

---

### Task 1: 設定與測試環境加入 sync token

**Files:**
- Modify: `backend/src/yarag/config.py:17-19`
- Modify: `backend/tests/conftest.py:11`
- Modify: `backend/.env.example`（已含說明，確認 `CF_SYNC_API_TOKEN` 存在）
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces: `settings.cf_sync_api_token: str`

- [ ] **Step 1: 在 conftest 補上測試環境變數**（否則 Settings 載入失敗，整個測試套件會壞）

在 `backend/tests/conftest.py` 第 11 行 `os.environ.setdefault("CF_API_TOKEN", "test-cf-token")` 之後加一行：

```python
os.environ.setdefault("CF_SYNC_API_TOKEN", "test-cf-sync-token")
```

- [ ] **Step 2: 寫失敗測試**

在 `backend/tests/test_config.py` 末尾新增：

```python
def test_sync_token_setting_present():
    from yarag.config import settings

    assert settings.cf_sync_api_token == "test-cf-sync-token"
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_config.py::test_sync_token_setting_present -v`
Expected: FAIL（`AttributeError: 'Settings' object has no attribute 'cf_sync_api_token'`）

- [ ] **Step 4: 在 config.py 加欄位**

在 `backend/src/yarag/config.py` 的 `cf_api_token: str = Field(init=False)`（第 19 行）之後加一行：

```python
    cf_sync_api_token: str = Field(init=False)
```

- [ ] **Step 5: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_config.py -v`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
cd backend && git add src/yarag/config.py tests/conftest.py .env.example && \
git commit -m "feat: 新增 CF_SYNC_API_TOKEN 設定（AI Search 同步用高權限 token）"
```

---

### Task 2: cloudflare.py 新增狀態查詢／同步觸發／檢索文字（同步 httpx）

**Files:**
- Modify: `backend/src/yarag/cloudflare.py`
- Test: `backend/tests/test_cloudflare.py`

**Interfaces:**
- Consumes: `settings.cf_sync_api_token`（Task 1）、既有 `_url()`、`_headers()`
- Produces:
  - `list_item_status() -> dict[str, dict]`：`{key: item_dict}`，item 含 `status`、`checksum`、`error`
  - `retrieve_text(query: str, key: str) -> str`：回傳該 key 命中 chunk 的文字（找不到回空字串）
  - `trigger_sync() -> str`：回傳 job id

> 註：這三個是**同步**函式（httpx.Client），供同步的 documents 端點呼叫；與既有 async 的 `search`/`stream_chat` 並存。

- [ ] **Step 1: 寫失敗測試**

在 `backend/tests/test_cloudflare.py` 末尾新增：

```python
class _SyncResp:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


def test_list_item_status_paginates(monkeypatch):
    pages = {
        1: {"result": [{"key": f"bills/{i}.md", "status": "completed", "checksum": f"c{i}", "error": None} for i in range(100)], "result_info": {"total_count": 101}},
        2: {"result": [{"key": "bills/100.md", "status": "completed", "checksum": "c100", "error": None}], "result_info": {"total_count": 101}},
    }

    def fake_get(self, url, **kwargs):
        assert "/items" in url
        return _SyncResp(pages[kwargs["params"]["page"]])

    monkeypatch.setattr(httpx.Client, "get", fake_get)
    m = cloudflare.list_item_status()
    assert len(m) == 101
    assert m["bills/100.md"]["checksum"] == "c100"


def test_retrieve_text_filters_by_key(monkeypatch):
    payload = {"result": {"chunks": [
        {"text": "正文內容", "item": {"key": "2026/07/15/x-a.pdf"}},
        {"text": "別的檔", "item": {"key": "bills/1.md"}},
    ]}}

    def fake_post(self, url, **kwargs):
        assert "/search" in url
        return _SyncResp(payload)

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    assert cloudflare.retrieve_text("a", "2026/07/15/x-a.pdf") == "正文內容"


def test_trigger_sync_returns_job_id(monkeypatch):
    def fake_post(self, url, **kwargs):
        assert "/jobs" in url
        assert kwargs["headers"]["Authorization"] == "Bearer test-cf-sync-token"
        return _SyncResp({"result": {"id": "job-123"}})

    monkeypatch.setattr(httpx.Client, "post", fake_post)
    assert cloudflare.trigger_sync() == "job-123"
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_cloudflare.py -k "item_status or retrieve_text or trigger_sync" -v`
Expected: FAIL（`AttributeError: module 'yarag.cloudflare' has no attribute 'list_item_status'`）

- [ ] **Step 3: 實作三個函式**

在 `backend/src/yarag/cloudflare.py` 末尾新增（檔頭已 `import httpx`、已有 `_url`/`_headers`）：

```python
def _sync_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {settings.cf_sync_api_token}"}


def list_item_status() -> dict[str, dict]:
    items: dict[str, dict] = {}
    page = 1
    with httpx.Client(timeout=30) as client:
        while True:
            resp = client.get(
                _url("/items"), headers=_headers(), params={"page": page, "per_page": 100}
            )
            resp.raise_for_status()
            batch = resp.json().get("result") or []
            for it in batch:
                key = it.get("key")
                if key:
                    items[key] = it
            if len(batch) < 100:
                break
            page += 1
    return items


def retrieve_text(query: str, key: str) -> str:
    with httpx.Client(timeout=30) as client:
        resp = client.post(
            _url("/search"),
            headers=_headers(),
            json={"messages": [{"role": "user", "content": query}]},
        )
        resp.raise_for_status()
        chunks = (resp.json().get("result") or {}).get("chunks") or []
    texts = [c.get("text") or "" for c in chunks if (c.get("item") or {}).get("key") == key]
    return "\n".join(texts)


def trigger_sync() -> str:
    with httpx.Client(timeout=30) as client:
        resp = client.post(_url("/jobs"), headers=_sync_headers(), json={})
        resp.raise_for_status()
        return (resp.json().get("result") or {}).get("id") or ""
```

- [ ] **Step 4: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_cloudflare.py -v`
Expected: PASS（含既有測試）

- [ ] **Step 5: 提交**

```bash
cd backend && git add src/yarag/cloudflare.py tests/test_cloudflare.py && \
git commit -m "feat: cloudflare 加 list_item_status/retrieve_text/trigger_sync"
```

---

### Task 3: 內容為空判定與 checksum 快取表

**Files:**
- Modify: `backend/src/yarag/models.py`
- Modify: `backend/src/yarag/uploads.py`（加純函式 `_content_is_empty`）
- Test: `backend/tests/test_models.py`、`backend/tests/test_uploads.py`

**Interfaces:**
- Produces:
  - `models.DocumentContentCheck`（`checksum` PK、`is_empty` bool、`checked_at`）
  - `uploads._content_is_empty(text: str) -> bool`

- [ ] **Step 1: 寫失敗測試（純函式）**

在 `backend/tests/test_uploads.py` 末尾新增：

```python
def test_content_is_empty_detects_metadata_only():
    from yarag.uploads import _content_is_empty

    metadata_only = (
        "# 0871b1f0-TARG.pdf\n## Metadata\n- PDFFormatVersion=1.7\n"
        "- Author=someone\n\n\n## Contents\n### Page 1"
    )
    assert _content_is_empty(metadata_only) is True


def test_content_is_empty_false_when_body_present():
    from yarag.uploads import _content_is_empty

    real = (
        "# 遠雄.pdf\n## Metadata\n- PDFFormatVersion=1.7\n\n\n"
        "## Contents\n### Page 1\n物品出入區申請表 申請人 部門 主管簽核 日期"
    )
    assert _content_is_empty(real) is False
```

- [ ] **Step 2: 寫失敗測試（模型建表）**

在 `backend/tests/test_models.py` 末尾新增：

```python
def test_document_content_check_table_created():
    from sqlalchemy import inspect

    from yarag.db import Base, engine, init_db

    Base.metadata.drop_all(engine)
    init_db()
    assert "document_content_checks" in inspect(engine).get_table_names()
```

- [ ] **Step 3: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_uploads.py::test_content_is_empty_detects_metadata_only tests/test_models.py::test_document_content_check_table_created -v`
Expected: FAIL（`ImportError: cannot import name '_content_is_empty'` / 表不存在）

- [ ] **Step 4: 加模型**

在 `backend/src/yarag/models.py` 末尾新增（檔頭已 import `Boolean, DateTime, String`、已有 `_now`、`Base`）：

```python
class DocumentContentCheck(Base):
    __tablename__ = "document_content_checks"
    checksum: Mapped[str] = mapped_column(String(64), primary_key=True)
    is_empty: Mapped[bool] = mapped_column(Boolean)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
```

- [ ] **Step 5: 加純函式**

在 `backend/src/yarag/uploads.py` 的 import 區確認有 `import re`（已有），在 `_display_name` 函式之後新增：

```python
_CONTENT_MIN_CHARS = 20


def _content_is_empty(text: str) -> bool:
    # 取 "## Contents" 之後的正文；沒有則視整體
    body = text.split("## Contents", 1)[-1]
    body = re.sub(r"(?m)^\s*#+.*$", "", body)  # 標題行（含 ### Page N）
    body = re.sub(r"(?m)^\s*[-*]\s.*$", "", body)  # 清單行（metadata 殘留）
    return len(re.sub(r"\s+", "", body)) < _CONTENT_MIN_CHARS
```

- [ ] **Step 6: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_uploads.py::test_content_is_empty_detects_metadata_only tests/test_uploads.py::test_content_is_empty_false_when_body_present tests/test_models.py::test_document_content_check_table_created -v`
Expected: PASS

- [ ] **Step 7: 提交**

```bash
cd backend && git add src/yarag/models.py src/yarag/uploads.py tests/test_models.py tests/test_uploads.py && \
git commit -m "feat: 內容為空判定與 checksum 快取表"
```

---

### Task 4: GET /documents 帶 index_status ＋ POST /documents/sync

**Files:**
- Modify: `backend/src/yarag/uploads.py`
- Test: `backend/tests/test_uploads.py`

**Interfaces:**
- Consumes: `cloudflare.list_item_status/retrieve_text/trigger_sync`（Task 2）、`_content_is_empty`、`models.DocumentContentCheck`（Task 3）、`db.get_db`
- Produces:
  - `DocumentOut.index_status: str`
  - `GET /api/v1/documents` 每筆多帶 `index_status`
  - `POST /api/v1/documents/sync` → `{"job_id": str}`

- [ ] **Step 1: 寫失敗測試**

在 `backend/tests/test_uploads.py` 末尾新增：

```python
def _patch_status(monkeypatch, status_map, text=""):
    from yarag import uploads

    monkeypatch.setattr(uploads.cloudflare, "list_item_status", lambda: status_map)
    monkeypatch.setattr(uploads.cloudflare, "retrieve_text", lambda q, k: text)


def test_documents_status_ready_for_markdown(client, auth_headers, monkeypatch):
    _patch_status(monkeypatch, {"bills/33717.md": {"status": "completed", "checksum": "c1", "error": None}})
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    assert docs[0]["index_status"] == "ready"


def test_documents_status_indexing_when_absent(client, auth_headers, monkeypatch):
    _patch_status(monkeypatch, {})  # key 不在 items
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    assert docs[0]["index_status"] == "indexing"


def test_documents_status_failed_on_error(client, auth_headers, monkeypatch):
    _patch_status(monkeypatch, {"bills/33717.md": {"status": "completed", "checksum": "c1", "error": "boom"}})
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    assert docs[0]["index_status"] == "failed"


def test_documents_status_indexing_when_cloudflare_down(client, auth_headers, monkeypatch):
    from yarag import uploads

    def boom():
        raise RuntimeError("cf down")

    monkeypatch.setattr(uploads.cloudflare, "list_item_status", boom)
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    assert docs[0]["index_status"] == "indexing"  # 安全退預設，列表仍回


def test_documents_status_empty_for_pdf_without_text(client, auth_headers, monkeypatch):
    from yarag import uploads

    class _P:
        def paginate(self, **kw):
            import datetime

            return [{"Contents": [{"Key": "2026/07/15/aa11bb22-scan.pdf", "Size": 9, "LastModified": datetime.datetime(2026, 7, 15)}]}]

    monkeypatch.setattr(uploads.s3_client, "get_paginator", lambda name: _P())
    _patch_status(
        monkeypatch,
        {"2026/07/15/aa11bb22-scan.pdf": {"status": "completed", "checksum": "cX", "error": None}},
        text="# scan.pdf\n## Metadata\n- x\n\n\n## Contents\n### Page 1",
    )
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    assert docs[0]["index_status"] == "empty"


def test_sync_endpoint_triggers_and_returns_job(client, auth_headers, monkeypatch):
    from yarag import uploads

    monkeypatch.setattr(uploads.cloudflare, "trigger_sync", lambda: "job-9")
    r = client.post("/api/v1/documents/sync", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["job_id"] == "job-9"


def test_sync_endpoint_requires_auth(client):
    assert client.post("/api/v1/documents/sync").status_code == 401


def test_sync_endpoint_502_on_failure(client, auth_headers, monkeypatch):
    from yarag import uploads

    def boom():
        raise RuntimeError("cf down")

    monkeypatch.setattr(uploads.cloudflare, "trigger_sync", boom)
    assert client.post("/api/v1/documents/sync", headers=auth_headers).status_code == 502
```

- [ ] **Step 2: 執行確認失敗**

Run: `cd backend && uv run pytest tests/test_uploads.py -k "status or sync_endpoint" -v`
Expected: FAIL（`index_status` 不存在／`/documents/sync` 404）

- [ ] **Step 3: 實作**

在 `backend/src/yarag/uploads.py`：

3a. 匯入區加入（檔頭）：

```python
from sqlalchemy.orm import Session

from yarag import cloudflare
from yarag.db import get_db
from yarag.models import DocumentContentCheck, User
```
（把既有的 `from yarag.models import User` 併成上面這行；`from sqlalchemy.orm import Session` 若未存在則新增。）

3b. `DocumentOut` 加欄位（第 46-50 行）：

```python
class DocumentOut(BaseModel):
    name: str
    size_bytes: int
    updated_at: datetime
    display_name: str
    index_status: str
```

3c. 在 `list_documents` 之前新增狀態判定輔助：

```python
_CHECKED_EXTS = (".pdf", ".docx", ".xlsx")


def _cached_is_empty(db: Session, key: str, item: dict) -> bool:
    checksum = item.get("checksum") or ""
    if checksum:
        cached = db.get(DocumentContentCheck, checksum)
        if cached is not None:
            return cached.is_empty
    query = _display_name(key).rsplit(".", 1)[0]
    empty = _content_is_empty(cloudflare.retrieve_text(query, key))
    if checksum:
        db.add(DocumentContentCheck(checksum=checksum, is_empty=empty))
        db.commit()
    return empty


def _derive_status(db: Session, key: str, item: dict | None) -> str:
    if item is None:
        return "indexing"
    if item.get("error") or item.get("status") in {"error", "failed"}:
        return "failed"
    if item.get("status") != "completed":
        return "indexing"
    if not key.lower().endswith(_CHECKED_EXTS):
        return "ready"  # md/txt 一定有文字
    try:
        return "empty" if _cached_is_empty(db, key, item) else "ready"
    except Exception:
        logger.exception("content check failed", extra={"key": key})
        return "indexing"  # 判不出來時安全退，不誤報 ready/empty
```

3d. 改寫 `list_documents` 簽名與內容：

```python
@router.get("/documents")
def list_documents(
    user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> list[DocumentOut]:
    try:
        status_map = cloudflare.list_item_status()
    except Exception:
        logger.exception("list_item_status failed")
        status_map = {}
    paginator = s3_client.get_paginator("list_objects_v2")
    docs = []
    for page in paginator.paginate(Bucket=settings.default_bucket):
        for obj in page.get("Contents", []):
            key = obj["Key"]
            docs.append(
                DocumentOut(
                    name=key,
                    size_bytes=obj["Size"],
                    updated_at=obj["LastModified"],
                    display_name=_display_name(key),
                    index_status=_derive_status(db, key, status_map.get(key)),
                )
            )
    docs.sort(key=lambda d: d.updated_at, reverse=True)
    return docs
```

3e. 在 `download_document` 之後新增同步端點：

```python
@router.post("/documents/sync")
def sync_documents(user: User = Depends(get_current_user)) -> dict[str, str]:
    try:
        job_id = cloudflare.trigger_sync()
    except Exception as e:
        logger.exception("trigger_sync failed")
        raise HTTPException(status_code=502, detail="無法觸發索引同步，稍後會由排程自動處理") from e
    return {"job_id": job_id}
```

- [ ] **Step 4: 執行確認通過**

Run: `cd backend && uv run pytest tests/test_uploads.py -v`
Expected: PASS（含既有測試——注意既有 `test_list_documents` 等仍需通過，因 `list_item_status` 會被呼叫；未 patch 的既有測試會走 `except` 退 `status_map={}`，`index_status` 為 `indexing`，不影響其斷言。）

- [ ] **Step 5: 全套測試＋lint**

Run: `cd backend && uv run pytest && uv run ruff check src tests`
Expected: 全綠

- [ ] **Step 6: 提交**

```bash
cd backend && git add src/yarag/uploads.py tests/test_uploads.py && \
git commit -m "feat: /documents 帶 index_status 並新增 /documents/sync"
```

---

### Task 5: 前端 api.ts — index_status 型別與 triggerSync

**Files:**
- Modify: `frontend/src/edu-rag/services/api.ts:158-159`
- Test: `cd frontend && npm run build`（型別檢查）

**Interfaces:**
- Produces:
  - `listDocuments` 回傳型別加 `index_status: 'indexing'|'ready'|'empty'|'failed'`
  - `triggerSync(): Promise<{ job_id: string }>`

- [ ] **Step 1: 改型別並新增函式**

把 `frontend/src/edu-rag/services/api.ts` 第 158-159 行的 `listDocuments` 換成：

```typescript
export type IndexStatus = 'indexing' | 'ready' | 'empty' | 'failed';

export const listDocuments = () =>
    request<{ name: string; size_bytes: number; updated_at: string; display_name: string; index_status: IndexStatus }[]>('/api/v1/documents');

export const triggerSync = () =>
    request<{ job_id: string }>('/api/v1/documents/sync', { method: 'POST' });
```

- [ ] **Step 2: 型別檢查通過**

Run: `cd frontend && npm run build`
Expected: 建置成功（此步驟後 EduRagDocsPage 尚未用到新欄位，不會有型別錯誤）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/edu-rag/services/api.ts && \
git commit -m "feat(fe): api 加 index_status 型別與 triggerSync"
```

---

### Task 6: 前端文件頁 — 狀態徽章（4 態、無 icon）＋ 輪詢

**Files:**
- Modify: `frontend/src/edu-rag/pages/EduRagDocsPage.tsx`
- Test: `cd frontend && npm run build` ＋ 瀏覽器手動

**Interfaces:**
- Consumes: `listDocuments`（含 `index_status`）、`IndexStatus`（Task 5）

- [ ] **Step 1: ServerDoc 型別加 index_status，import 型別**

在 `frontend/src/edu-rag/pages/EduRagDocsPage.tsx`：

第 6 行 import 改為：
```typescript
import { listDocuments, requestDownloadUrl, type IndexStatus } from '../services/api';
```

`ServerDoc` 型別（第 10-18 行）加一欄：
```typescript
type ServerDoc = {
    id: string;
    key: string;
    name: string;
    type: string;
    updatedAt: number;
    sizeLabel: string;
    isServer: true;
    indexStatus: IndexStatus;
};
```

- [ ] **Step 2: refreshDocs 帶入 index_status**

在 `refreshDocs`（第 59-69 行的 `.map`）的回傳物件加一欄 `indexStatus: d.index_status,`：

```typescript
            serverDocs = remote.map((d) => {
                return {
                    id: `server-${d.name}`,
                    key: d.name,
                    name: d.display_name,
                    type: inferType(d.display_name),
                    updatedAt: new Date(d.updated_at).getTime(),
                    sizeLabel: `${(d.size_bytes / 1024).toFixed(0)} KB`,
                    isServer: true as const,
                    indexStatus: d.index_status,
                };
            });
```

- [ ] **Step 3: 新增狀態徽章 helper 與逐列狀態**

在 `typeLabel` 函式（第 260 行附近）之後新增：

```typescript
    // 逐列索引狀態：伺服器文件用其 index_status；本地剛上傳紀錄視為索引中。
    const rowStatus = (doc: UploadRecord | ServerDoc): IndexStatus =>
        (doc as ServerDoc).isServer ? (doc as ServerDoc).indexStatus : 'indexing';

    // 狀態文字＋顏色（純文字，無 icon）。
    const statusBadge = (s: IndexStatus): { label: string; className: string } => {
        switch (s) {
            case 'ready':
                return { label: '可查詢', className: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400' };
            case 'empty':
                return { label: '無可讀內容', className: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-400' };
            case 'failed':
                return { label: '索引失敗', className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' };
            default:
                return { label: '索引中', className: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400' };
        }
    };
```

- [ ] **Step 4: 換掉硬編碼的「已索引」徽章**

把第 356-360 行的狀態 `<td>` 換成：

```typescript
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const b = statusBadge(rowStatus(doc));
                                            return (
                                                <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${b.className}`}>
                                                    {b.label}
                                                </span>
                                            );
                                        })()}
                                    </td>
```

- [ ] **Step 5: 加輪詢——有檔在「索引中」時每 8 秒刷新，最多 ~5 分鐘**

在 `refreshDocs` 的 `useEffect`（第 77-82 行）之後新增：

```typescript
    // 有任一檔在「索引中」時輪詢刷新，全部就緒即停（上限約 5 分鐘）。
    useEffect(() => {
        const anyIndexing = completedDocs.some((d) => rowStatus(d) === 'indexing');
        if (!anyIndexing) return;
        let ticks = 0;
        const timer = setInterval(() => {
            ticks += 1;
            if (ticks > 38) {  // 38 × 8s ≈ 5 分鐘
                clearInterval(timer);
                return;
            }
            void refreshDocs();
        }, 8000);
        return () => clearInterval(timer);
    }, [completedDocs]);
```

- [ ] **Step 6: 型別檢查通過**

Run: `cd frontend && npm run build`
Expected: 建置成功

- [ ] **Step 7: 提交**

```bash
git add frontend/src/edu-rag/pages/EduRagDocsPage.tsx && \
git commit -m "feat(fe): 文件頁索引狀態徽章（4 態）與自動輪詢"
```

---

### Task 7: 前端上傳頁 — 上傳完成後自動觸發同步

**Files:**
- Modify: `frontend/src/edu-rag/pages/EduRagUploadPage.tsx`
- Test: `cd frontend && npm run build` ＋ 瀏覽器手動

**Interfaces:**
- Consumes: `triggerSync`（Task 5）

- [ ] **Step 1: import triggerSync**

第 4 行改為：
```typescript
import { requestUploadUrl, uploadToR2, triggerSync } from '../services/api';
```

- [ ] **Step 2: 整批上傳完成後觸發一次同步**

把 `handleFileChange`（第 62-86 行）中的 `newItems.forEach(...)` 區塊換成：

```typescript
        void (async () => {
            await Promise.all(
                newItems.map(async ({ record, file }) => {
                    await saveUpload(record);
                    setUploads((prev) => [record, ...prev]);
                    await processFile(file, record.id);
                }),
            );
            // 只要有任一檔成功上傳，就觸發一次索引同步（失敗不影響上傳結果）。
            try {
                await triggerSync();
            } catch {
                // 同步觸發失敗時，Cloudflare 排程仍會自動處理，靜默即可。
            }
        })();
```

- [ ] **Step 3: 型別檢查通過**

Run: `cd frontend && npm run build`
Expected: 建置成功

- [ ] **Step 4: 提交**

```bash
git add frontend/src/edu-rag/pages/EduRagUploadPage.tsx && \
git commit -m "feat(fe): 上傳完成後自動觸發 AI Search 同步"
```

---

### Task 8: 端對端手動驗證

**Files:** 無（驗證）

- [ ] **Step 1: 設定實際 sync token**

確認 `backend/.env` 有 `CF_SYNC_API_TOKEN`（已於本次設定）。重建 dev 後端讓設定生效：

Run: `cd /Users/weihsuan/RAG_new && docker compose -f docker-compose.dev.yml up -d --force-recreate backend`
Expected: backend 容器 Recreated/Started

- [ ] **Step 2: 驗證狀態欄**

開 http://localhost:3100 → 登入 → 文件管理頁。
Expected: 議案（.md）顯示「可查詢」；先前那份 Excel-PDF `TARG人員手機權限.pdf` 顯示「無可讀內容」。

- [ ] **Step 3: 驗證上傳→自動同步→狀態流轉**

到上傳頁傳一份**有文字**的檔（例如 .md 或可選取文字的 PDF）。回文件頁。
Expected: 該檔先顯示「索引中」（琥珀），輪詢期間自動更新，數分鐘後轉「可查詢」（綠），不需手動重整。

- [ ] **Step 4: 確認網路請求**

用瀏覽器開發者工具或 `docker compose -f docker-compose.dev.yml logs backend | grep -i sync`。
Expected: 上傳後有 `POST /api/v1/documents/sync` 且回 200 帶 job_id。

---

## Self-Review

**Spec coverage：**
- 四狀態（索引中/可查詢/無可讀內容/索引失敗）→ Task 4 `_derive_status` ＋ Task 6 `statusBadge`。✓
- 「無可讀內容」偵測＋checksum 快取 → Task 2 `retrieve_text`、Task 3 `_content_is_empty`＋`DocumentContentCheck`、Task 4 `_cached_is_empty`。✓
- 上傳後自動同步 → Task 2 `trigger_sync`、Task 4 `POST /documents/sync`、Task 7 前端呼叫。✓
- 前端輪詢到全部就緒 → Task 6 Step 5。✓
- 兩把 token 分權、sync token 只在後端 → Task 1 設定、Task 2 `_sync_headers`、Task 4 端點。✓
- 純文字＋顏色、無 icon → Task 6 `statusBadge`。✓
- 錯誤處理（cloudflare down 退 indexing、sync 失敗回 502） → Task 4 tests＋實作。✓
- 測試（狀態對應、空判定、快取、sync）→ Task 2/3/4 測試。✓

**Placeholder scan：** 無 TBD/TODO；每個程式步驟均含完整程式碼。✓

**Type consistency：** `index_status`/`IndexStatus` 值 `indexing|ready|empty|failed` 在後端契約、api.ts、EduRagDocsPage 一致；`list_item_status`/`retrieve_text`/`trigger_sync` 簽名在 Task 2 定義、Task 4 消費一致；`_content_is_empty`、`DocumentContentCheck(checksum,is_empty,checked_at)` 跨 Task 3/4 一致。✓

**已知範圍外（spec 明列）：** 進度百分比、單檔重索引按鈕、刪檔連動移除索引——不在本計畫。
