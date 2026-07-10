# 網路搜尋備援設計

日期：2026-07-10
狀態：已與使用者確認（方案 A）

## 背景與目標

現行聊天僅依議案資料庫回答（Cloudflare AI Search，刻意的「僅依文件」設計）。當資料庫查無相關內容時，使用者需要一條明確標示的備援路徑：以 OpenAI（含網路搜尋工具）取得網路資訊。官方資料與網路資訊必須在視覺與資料層都可區分。

## 需求（已確認）

1. 觸發：使用者按鈕觸發，不自動切換
2. 按鈕時機：每則 AI 回答下方都顯示（不做「查無資料」偵測）
3. 記錄：網路回答存入同一對話，標記來源，重開對話仍以網路樣式呈現
4. 成本防護：第一版不做每人限額（刻意的 YAGNI 決定）；依賴 OpenAI 帳號層級的用量上限與警報

## 方案選擇

- 採方案 A：擴充 `POST /api/v1/chat` 加 `mode` 參數，SSE 契約不變。
- 否決 B（獨立 endpoint）：前端需第二套呼叫邏輯，工程量增而無可見效益。
- 否決 C（前端直連 OpenAI）：金鑰暴露，違反既有安全架構。

## API 變更

`POST /api/v1/chat` body 增為 `{message, thread_id, mode}`：

- `mode`: `"kb"`（預設，現行 Cloudflare 路徑）| `"web"`（OpenAI 網路搜尋路徑）
- 非法 mode → 422（Pydantic Literal 驗證）
- SSE 事件序不變：`citations` → `delta`… → `done`；例外時 `error`（沿用同一訊息文案）
- `web` 模式的 citations 項目：`{doc_name: <網頁標題>, snippet: <摘要>, similarity: 0, url: <網址>}`（新增選填欄位 `url`；kb 模式不帶 url）
- `done` 增帶 `source` 欄位（`kb`|`web`），供前端即時標示

## 後端

- 新模組 `src/yarag/openai_client.py`：
  - `async stream_web_answer(question: str) -> AsyncIterator[...]`：呼叫 OpenAI Responses API（`web_search` 工具、串流），逐段 yield 文字；完成時提供來源清單（標題＋網址）
  - 設定：`.env` 新增 `OPENAI_API_KEY`（必填）、`OPENAI_MODEL`（預設 `gpt-5-mini` 級的低成本搜尋模型，確切預設值以實作時官方可用清單為準並記錄於 .env.example）
  - 系統提示：以繁體中文回答、附來源、聲明為網路資訊非官方資料
- `chat.py` 依 `mode` 分流；`web` 模式不呼叫 Cloudflare
- `models.py`：`Message` 加 `source: str = "kb"` 欄位（String(10)，SQLite 既有表以 ALTER TABLE 遷移——啟動時檢查欄位不存在則補）
- 歷史訊息傳遞：web 模式僅送當前問題（不帶對話歷史），降低成本與洩漏面

## 前端

- `api.ts`：`streamChat` 加第四參數 `mode`（預設 `'kb'`）；`Citation` 型別加選填 `url`
- `ChatWindow`：每則 assistant 訊息下方顯示「🌐 用網路搜尋補充」按鈕；點擊後以該則回答對應的**原始使用者問題**、`mode:'web'` 重發（新的一組 user/assistant 訊息附加在同一對話）
- 網路回答樣式：不同底色＋「網路資訊，僅供參考」標籤；citations 有 `url` 時渲染為外開連結
- 判斷依據：訊息的 `source` 欄位（`GET /threads/{id}` 的 MessageOut 同步加 `source`）

## 錯誤處理

- OpenAI 呼叫失敗：SSE `error` 事件、訊息沿用「系統暫時無法取得資料，請稍後再試」；使用者問題已入庫、不存半截回答（與 kb 模式一致）
- `OPENAI_API_KEY` 缺失：啟動自檢即失敗（必填欄位）

## 測試

- pytest（TDD）：mode 分流（kb 不碰 openai、web 不碰 cloudflare，皆以 monkeypatch 驗證）；web 模式事件序與 done.source；非法 mode 422；source 欄位入庫與 threads 回傳
- 遷移測試：舊表（無 source 欄）啟動後自動補欄，既有資料 source 預設 kb
- 煙霧腳本 `scripts/smoke_openai.py`：對真 OpenAI 問一題、驗證來源清單格式（比照 cloudflare 煙霧腳本的角色——實測真實 schema）
- 端對端人工驗收：問資料庫沒有的主題 → 按網路搜尋 → 樣式區隔、來源連結可點、重新整理後標記仍在

## 不在本次範圍

- 每人／每日用量限額
- 自動偵測「查無資料」
- 網路結果寫回知識庫
