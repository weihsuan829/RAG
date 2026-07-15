# 上傳索引狀態與自動同步設計

日期：2026-07-15
狀態：已與使用者確認

## 背景與目標

使用者上傳文件後，Cloudflare AI Search 的索引是「非同步、排程觸發」，上傳到可查詢之間有數分鐘落差，且部分檔案（如掃描檔、Excel 匯出的 PDF）雖索引完成卻抽不到文字。現況只能到 Cloudflare 後台判斷，正式上線後同仁無法自行得知文件是否可查詢。

本功能在系統內提供兩件事：
1. **索引狀態可視化**：文件列表即時顯示每份檔的索引狀態（含「已索引但無可讀內容」）。
2. **上傳後自動同步**：上傳完成即觸發 AI Search 索引，把等待從「下一次排程」縮到「馬上」。

使用者完全不需碰 Cloudflare 後台。

## 需求（已確認）

1. 狀態四種、以**純文字＋顏色**呈現，不使用 emoji/icon：
   - **索引中**（琥珀）
   - **可查詢**（綠）
   - **無可讀內容**（橘）
   - **索引失敗**（紅）
2. 「無可讀內容」為必要狀態（使用者痛點：Excel 匯出的 PDF 索引完成卻抽不到文字）。
3. 上傳完成後自動觸發同步。
4. 前端輪詢更新狀態，全部就緒即停。
5. 最小權限：查詢與同步用不同 token，sync token 只在後端使用。

## 可行性（已實測，2026-07-15）

實例 base：`https://api.cloudflare.com/client/v4/accounts/{acct}/ai-search/instances/{inst}`

| 用途 | 方法/路徑 | Token | 實測 |
|---|---|---|---|
| 查單檔狀態 | `GET /items` | 查詢 token（現有 `CF_API_TOKEN`，索引+執行即可） | 200 ✓ |
| 觸發同步 | `POST /jobs` | 新 sync token（`CF_SYNC_API_TOKEN`，AI Search **Edit**） | 200，回傳 job id ✓ |
| 看同步進度 | `GET /jobs` | sync token（Edit） | 200 ✓ |
| 檢索文字（判空內容） | `POST /search`，body `{"messages":[{"role":"user","content":<query>}]}` | 查詢 token | 200 ✓ |

註：`POST /sync`、`GET /` 等路徑為 404 或需 Edit；正確的同步觸發是 `POST /jobs`。

### `/items` 回傳（每筆）
```json
{ "id": "...", "key": "bills/31207.md", "status": "completed",
  "chunks_count": 1, "file_size": 2105, "checksum": "259e...",
  "error": null, "next_action": null,
  "metadata": {"filename":"...","folder":"...","timestamp":...},
  "last_seen_at": "...", "created_at": "..." }
```
- `result` 為**陣列**，預設每頁 20 筆；需分頁取全（分頁機制於實作時確定：page/per_page 或 cursor，並在 cloudflare.py 封裝）。
- `/items/{id}` 與 `/items/{id}/content` **不回傳抽取的文字**，故「無可讀內容」無法只靠 `/items` 欄位判定。

## 狀態判定規則

後端合併「R2 文件清單（現有 listDocuments）」與「AI Search `/items`（key→item）」，對每份文件輸出 `index_status`：

| API 契約值 | 中文標籤 | 顏色 | 判定條件 |
|---|---|---|---|
| `indexing` | 索引中 | 琥珀 | key 不在 /items（剛上傳未被掃到），或 item.status ∈ {pending, processing, queued, running} |
| `ready` | 可查詢 | 綠 | item.status = completed **且** 內容非空 |
| `empty` | 無可讀內容 | 橘 | item.status = completed **且** 內容為空（僅 metadata） |
| `failed` | 索引失敗 | 紅 | item.error 非 null，或 status ∈ {error, failed} |

（實際 Cloudflare status 字面值以實作時觀察為準；未知值一律歸為 `indexing`，避免誤報就緒。）

### 「內容為空」判定
- 對該檔 key 呼叫 `POST /search`（query 用檔名去副檔名），取回其 chunk `text`。
- 移除 metadata 骨架（開頭 `# <檔名>`、`## Metadata` 到 `## Contents`、`### Page N` 標題）後，若剩餘可讀字元 < 門檻（初值 20 字，實作時可調），判為空。
- **快取**：以 `checksum` 為鍵存入 DB（新表 `document_content_check`：checksum PK、is_empty bool、checked_at）。同一 checksum 不重複檢索；checksum 變動才重算。

## 架構與元件

### 後端

**`cloudflare.py`（擴充）**
- `async list_item_status() -> dict[str, dict]`：分頁讀 `/items`，回 `{key: {status, checksum, error, chunks_count}}`。
- `async retrieve_text(key: str) -> str`：以檔名查 `/search`，回該 key 的 chunk 文字（找不到回空字串）。
- `async trigger_sync() -> str`：`POST /jobs`（用 sync token），回 job id；失敗拋 RuntimeError。
- sync token 由設定注入；search/items 用既有查詢 token。

**`config.py`**
- 新增 `cf_sync_api_token: str`（必填）。

**內容檢查快取（新模組或併入 models.py）**
- 表 `document_content_check(checksum PK, is_empty bool, checked_at)`。
- `async is_content_empty(key, checksum) -> bool`：命中快取直接回；未命中呼叫 `retrieve_text` 判定、寫快取。

**`uploads.py`（擴充）**
- `GET /api/v1/documents`：回傳每筆多帶 `index_status`（合併 R2 清單 × `list_item_status` × 內容快取）。狀態計算不阻塞主要清單——AI Search 查詢失敗時 `index_status` 退為 `indexing`（不讓整個列表壞掉）。
- 新增 `POST /api/v1/documents/sync`：呼叫 `trigger_sync()`，回 `{job_id}`；需登入。

### 前端

**`api.ts`**
- `listDocuments` 型別加 `index_status: 'indexing'|'ready'|'empty'|'failed'`。
- 新增 `triggerSync(): Promise<{job_id}>` → `POST /documents/sync`。

**`EduRagDocsPage.tsx`**
- 列表新增「狀態」欄，依 `index_status` 顯示對應中文標籤與顏色（純文字，無 icon）。
- 上傳成功後：呼叫 `triggerSync()`（多檔上傳只在整批完成後觸發一次），接著每 8 秒輪詢 `listDocuments`；只要有任一檔為 `indexing` 就續輪，全部離開 `indexing` 即停；保險上限 ~5 分鐘後停止並保留當前狀態。
- 顏色用既有 Tailwind 色階，與現行參考來源的簡約風格一致。

## 資料流

```
上傳（瀏覽器 → presigned → R2）完成
    │  前端 uploadToR2 resolve
    ▼
POST /documents/sync ──► cloudflare.trigger_sync() ──► AI Search POST /jobs
    │
    ▼ 前端每 8s
GET /documents ──► 合併 R2清單 × /items × 內容快取 ──► 回 index_status
    │
    ▼ 前端渲染狀態徽章；無 indexing 即停輪詢
```

## 錯誤處理

- `trigger_sync` 失敗（Cloudflare 5xx/權限）：`POST /documents/sync` 回 502 與訊息；前端顯示「無法觸發同步，稍後會由排程自動處理」，不中斷上傳成功狀態。
- `list_item_status` 失敗：該次 `GET /documents` 的 `index_status` 全退為 `indexing`（安全預設），列表本身仍正常回傳。
- `retrieve_text` 失敗：視為「尚無法判定」→ `index_status` 暫為 `indexing`（不誤報 ready，也不誤報 empty）。
- `CF_SYNC_API_TOKEN` 缺失：啟動自檢失敗（必填欄位）。

## 安全

- 查詢 token（現有）：search／items，讀取層級。
- sync token（新）：AI Search Edit，僅後端 `trigger_sync` 使用，不下發前端。
- 兩者皆存 `backend/.env`，不進 git；`.env.example` 補上 `CF_SYNC_API_TOKEN` 說明。

## 測試

- **pytest（monkeypatch cloudflare 客戶端）**：
  - 狀態對應：completed+有內容→ready、completed+空→empty、pending→indexing、error→failed、key 不在 items→indexing、未知 status→indexing。
  - 內容判定：metadata-only 文字→empty；含正文→ready；快取命中不重打 search。
  - `POST /documents/sync` 成功回 job_id；trigger 失敗回 502。
  - `list_item_status` 失敗時 `GET /documents` 仍回列表、狀態退 indexing。
- **內容快取遷移測試**：新表啟動自動建立（沿用既有 startup 遷移模式）。
- **人工端對端**：傳含文字檔 → 索引中 → 可查詢；傳掃描/Excel-PDF → 無可讀內容；觀察上傳後自動觸發同步、輪詢自動停止。

## 不在本次範圍

- 索引進度百分比／預估時間。
- 手動「重新索引單一檔」按鈕（本次只做整體 sync 觸發）。
- 刪除文件時同步移除索引（AI Search 下次 sync 會自然對齊）。

## 附註

- 舊的壞實例 `edu-bills-search` 待使用者於 Dashboard 刪除，與本功能無關但列為待辦。
- 完整 Cloudflare 建置與踩坑見 `docs/cloudflare-setup.md`。
