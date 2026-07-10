# 檔名保留與下載實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 上傳檔保留原始檔名（編入 key）、文件列表顯示真名並可點擊下載（presigned GET）。

**Architecture:** key 格式改 `YYYY/MM/DD/{uuid8}-{清洗檔名}`；documents 回 display_name；新端點 `GET /api/v1/documents/download` 回 presigned GET（attachment、UTF-8 檔名）。前端列表名稱變可點。

**Tech Stack:** 既有；不加套件。

## Global Constraints

- 後端 `/Users/weihsuan/RAG_new/backend`（分支 `filename-fix`）；前端 `/Users/weihsuan/RAG_new`（同名分支）
- TDD；`uv run ruff check src tests scripts` 乾淨；既有 38 測試不壞；前端驗證 = npm run build
- spec：docs/superpowers/specs/2026-07-10-filename-preservation-design.md

---

### Task 1: 後端——key 含檔名、display_name、下載端點

**Files:**
- Modify: `backend/src/yarag/uploads.py`
- Test: `backend/tests/test_uploads.py`（追加）

**Interfaces:**
- `_safe_filename(file_name: str, ext: str) -> str`：移除 `/ \\` 與控制字元、strip、壓縮連續空白為一個、截 80 字元（含副檔名）；若結果不以 `ext` 結尾則補正（先去掉原副檔名再加 `ext`）；空字串退回 `f"file{ext}"`
- key = `f"{now:%Y/%m/%d}/{uuid4().hex[:8]}-{safe}"`
- `GET /api/v1/documents` 項目加 `display_name: str` = key 最後一段剝除 `^[0-9a-f]{8}-`（用 `re.sub(r"^[0-9a-f]{8}-", "", tail)`）
- `GET /api/v1/documents/download?key=...`（需登入）→ `DownloadResponse(download_url, expires_in)`（from yarag.schemas）；presign `get_object`，Params 含 `ResponseContentDisposition=f"attachment; filename*=UTF-8''{quote(display_name)}"`；key 含 `..` 或以 `/` 開頭 → 400「非法的檔案路徑」；presign 例外 → 500「無法產生下載網址」

- [ ] **Step 1: 失敗測試**（追加到 tests/test_uploads.py；沿用既有 fake_s3 fixture，為它補 `generate_presigned_url` 對 get_object 的分支與呼叫參數紀錄）：

```python
def test_upload_key_contains_sanitized_filename(client, auth_headers):
    r = client.post(
        "/api/v1/uploads",
        json={"content_type": "application/pdf", "file_name": "114年度 預算/說明.pdf", "size_bytes": 100},
        headers=auth_headers,
    )
    key = r.json()["key"]
    tail = key.split("/")[-1]
    assert tail.endswith("114年度 預算說明.pdf")  # 斜線被移除、空白保留單一
    assert len(tail.split("-", 1)[0]) == 8  # uuid8 前綴


def test_upload_filename_extension_corrected(client, auth_headers):
    r = client.post(
        "/api/v1/uploads",
        json={"content_type": "application/pdf", "file_name": "評估報告.docx", "size_bytes": 100},
        headers=auth_headers,
    )
    assert r.json()["key"].endswith(".pdf")


def test_documents_display_name(client, auth_headers, monkeypatch):
    from yarag import uploads

    class _P:
        def paginate(self, **kw):
            import datetime

            return [
                {
                    "Contents": [
                        {"Key": "bills/34619.md", "Size": 1, "LastModified": datetime.datetime(2026, 7, 9)},
                        {"Key": "2026/07/10/a1b2c3d4-預算說明.pdf", "Size": 2, "LastModified": datetime.datetime(2026, 7, 10)},
                    ]
                }
            ]

    monkeypatch.setattr(uploads.s3_client, "get_paginator", lambda name: _P())
    docs = client.get("/api/v1/documents", headers=auth_headers).json()
    names = {d["name"]: d["display_name"] for d in docs}
    assert names["bills/34619.md"] == "34619.md"
    assert names["2026/07/10/a1b2c3d4-預算說明.pdf"] == "預算說明.pdf"


def test_download_url(client, auth_headers):
    r = client.get(
        "/api/v1/documents/download", params={"key": "2026/07/10/a1b2c3d4-預算說明.pdf"}, headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert body["download_url"].startswith("https://")
    assert body["expires_in"] > 0


def test_download_rejects_bad_key(client, auth_headers):
    assert (
        client.get("/api/v1/documents/download", params={"key": "../secret"}, headers=auth_headers).status_code == 400
    )


def test_download_requires_auth(client):
    assert client.get("/api/v1/documents/download", params={"key": "x.md"}).status_code == 401
```

- [ ] **Step 2: 確認失敗**；**Step 3: 實作**（uploads.py：`import re`、`from urllib.parse import quote`；`_safe_filename` helper；key 生成改用之；DocumentOut 加 display_name 與 `_display_name(key)` helper；download endpoint 用 `s3_client.generate_presigned_url("get_object", Params={"Bucket":..., "Key": key, "ResponseContentDisposition": ...}, ExpiresIn=settings.default_expires_in)`）
- [ ] **Step 4: 全測試通過（既有 upload key 格式測試若斷言舊格式需同步更新）**；ruff；**Step 5: Commit** `feat: preserve original filenames in keys with download endpoint`

---

### Task 2: 前端——顯示真名、點擊下載

**Files:**
- Modify: `frontend/src/edu-rag/services/api.ts`、`frontend/src/edu-rag/pages/EduRagDocsPage.tsx`、`frontend/src/App.tsx`（Dashboard 文件區塊若顯示名稱則同步 display_name）

**Interfaces:**
- api.ts：`listDocuments` 回傳型別加 `display_name: string`；新增 `requestDownloadUrl(key: string) => Promise<{download_url: string; expires_in: number}>`（GET，query 用 `encodeURIComponent(key)`）
- DocsPage：伺服器文件的名稱欄顯示 `display_name`，渲染為可點（`<button>` 樣式近連結或 `<a role`），onClick → `const {download_url} = await requestDownloadUrl(doc.name)` → `window.open(download_url, '_blank')`；載入中防重複點擊；失敗 alert「下載失敗，請稍後再試」；本地 IndexedDB 項目行為不變
- 驗證：npm run build 綠

- [ ] **Step 1: 實作**；**Step 2: build 綠**；**Step 3: Commit** `feat: docs list shows original names with click-to-download`

---

### Task 3: 端對端驗收（控制者親自執行）

- [ ] pytest／ruff／build 全綠
- [ ] API：上傳「測試中文檔名.md」→ key 含原名；documents 列表 display_name 正確；download 端點回網址且 curl 該網址 200、Content-Disposition 帶原名
- [ ] 瀏覽器：文件頁顯示真名、點名稱觸發下載；舊議案檔顯示 34619.md 照舊
- [ ] 聊天：問新上傳檔的內容，出處卡片顯示可讀名稱
- [ ] 合併 filename-fix → 主分支
