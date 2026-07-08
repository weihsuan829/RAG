# 前後端整合設計：教育局議案 RAG 系統

日期：2026-07-09
狀態：已與使用者逐段確認

## 背景與目標

前端（React）目前聊天直連 OpenAI（金鑰暴露在前端）、登入與上傳皆為假資料。後端（yarag FastAPI）只有 R2 上傳通行證 API。資料面已就緒：303 筆新北市議會教育類議案（Markdown）已上傳至 R2 bucket `ntpc-edu-bills` 的 `bills/` 下，由 Cloudflare AI Search 自動索引。

目標：前端接上自建後端，聊天可精準回覆議案資料並附出處，登入與上傳改為真實流程。

## 需求（已確認）

1. 使用情境：教育局同仁內部使用（真實登入管控）
2. 帳號：預建個人帳號，無自助註冊
3. 聊天記錄：存後端資料庫，各使用者隔離
4. 範圍：聊天＋上傳都接真
5. 部署：先本機，雲端/局端部署為後續階段
6. 資料庫：開發期 SQLite，經 SQLAlchemy 抽象，部署時可換 PostgreSQL（僅改 `DATABASE_URL`）

## 方案選擇

- 採用方案 A：擴充既有 FastAPI 後端＋SQLite。
- 否決 B（改寫為 Cloudflare Workers）：需丟棄既有後端、學習新平台。
- 否決 C（檢索用 Cloudflare、生成自接 OpenAI）：多一把金鑰與帳單；AI Search 的系統提示詞調校通常足夠，且 A 的架構之後可無痛升級為 C。

## 架構總覽

```
React 前端 (5173)
  │  全部請求帶 JWT，僅與自家後端通訊
  ▼
FastAPI 後端 yarag (8010)
  ├─ auth：登入、發 JWT
  ├─ chat：檢索 → 先推出處 → 串流答案 → 存資料庫
  ├─ threads：對話記錄 CRUD（僅本人）
  └─ uploads：R2 簽名網址（加驗證與白名單）
  │
  ├────────► SQLite（users / threads / messages）
  └────────► Cloudflare：R2（文件）＋ AI Search（索引與生成，全自動）
```

聊天資料流：前端 `POST /api/v1/chat` → 後端驗 token → SSE 先推 `citations` 事件 → 串流 `delta` 文字片段 → `done` → 寫入資料庫。出處先於答案送達，使用者在生成前即可看到依據。

後端對 Cloudflare 為兩段式呼叫：先打 AI Search 的 `search` 端點取得相關段落（產生 citations），再打 `chat/completions`（`stream: true`）串流生成答案。兩者皆為同一實例、同一把 token。

## API 規格

前綴 `/api/v1/`；除登入外皆需 `Authorization: Bearer <token>`。

### 認證

- `POST /auth/login`：`{username, password}` → `{access_token, display_name}`；失敗 401。token 效期 8 小時。
- `GET /auth/me`：回目前使用者；前端開頁驗 token 用。
- 帳號預建：CLI 腳本 `create_user.py`（無管理介面，YAGNI）。

### 聊天

- `POST /chat`：`{message, thread_id}`（`thread_id` 為空＝開新對話）。回應為 SSE，事件依序：
  1. `citations`：`[{doc_name, snippet, similarity}]`（對應前端既有 Citation 型別）
  2. `delta`：答案文字片段（多個）
  3. `done`：`{thread_id, message_id}`
  4. `error`（異常時）：`{message}`

### 對話記錄

- `GET /threads`：本人對話列表（標題、更新時間、預覽）
- `GET /threads/{id}`：完整訊息含出處
- `DELETE /threads/{id}`
- 標題＝第一句使用者訊息前 30 字，自動產生。

### 上傳與文件

- `POST /uploads`：沿用簽名網址設計，加上：需登入；請求帶 `{content_type, file_name, size_bytes}`；大小上限 4MB（AI Search 索引上限，超過直接 400 並說明）；白名單擴為 PDF、Word（docx）、Excel（xlsx）、純文字、Markdown。
- `GET /documents`：列出 bucket 文件（名稱、大小、時間），供文件管理頁。

### 權限模型

所有登入者平權（聊天、上傳、看文件列表）；聊天記錄各自隔離。不分角色；`users.is_admin` 欄位預留。

## 資料庫結構

SQLAlchemy 定義；啟動時自動建表；`DATABASE_URL` 於 `.env`（開發期 `sqlite:///data.db`）。`data.db` 加入 `.gitignore`。

- **users**：id、username（唯一）、display_name、password_hash（argon2）、is_active、is_admin（預留）、created_at
- **threads**：id（UUID）、user_id（隔離鍵）、title、created_at、updated_at
- **messages**：id、thread_id、role（user/assistant）、content、citations（JSON 文字）、created_at

出處存 JSON 欄位而非獨立表：僅隨訊息整包讀寫，無單獨查詢需求。

## 前端改動

原則：畫面元件不動，只換資料來源。

- 新增 `services/api.ts`：唯一後端通道；讀 `VITE_API_BASE_URL`；自動帶 token；401 統一導回登入頁。
- 刪除 `openaiService.ts` 與 `VITE_OPENAI_API_KEY`（金鑰不得存在於前端）。
- `LoginPage`：接真 `/auth/login`，失敗顯示「帳號或密碼錯誤」。
- 路由守衛：進 `/app/*` 以 `/auth/me` 驗證，無效導回登入。
- `EduRagChatPage`／`ChatWindow`：對話列表接 `GET /threads`；送訊息改接後端 SSE；`citations` 事件寫入訊息出處欄位；移除「靈活模式」「思維鏈」開關（AI Search 一律依文件回答，與靈活模式語意矛盾）。
- `EduRagUploadPage`：IndexedDB 假流程改為「要通行證 → 直傳 R2 → 顯示已上傳、索引處理中」；選檔當下即驗大小與格式。
- `EduRagDocsPage`：接 `GET /documents`；詳情頁僅顯示基本資訊，不做預覽。
- 前端 `.env`：`VITE_API_BASE_URL=http://127.0.0.1:8010`。

## 錯誤處理

- 登入失敗與停用帳號一律回「帳號或密碼錯誤」（不洩漏帳號存在性）。
- 401 由前端服務層統一攔截導回登入頁。
- Cloudflare 異常：SSE 推 `error` 事件，顯示「系統暫時無法取得資料，請稍後再試」；使用者提問已存，未完成的 AI 回覆不入庫。
- 上傳：前後端皆驗大小與格式（前端為即時提示，後端為權威檢查）。
- 後端啟動自檢：`.env` 缺值即拒絕啟動並明示缺項。
- CORS：僅允許設定檔中的前端網址。

## 測試策略

- 後端 pytest（TDD）：登入成功／失敗／停用／過期；**對話隔離（A 不可讀 B）**；聊天 SSE 事件順序（Cloudflare 以假替身模擬）；上傳驗證。
- 前端：不建測試框架；以端對端人工驗收清單取代——建帳號→登入→問已知議案驗出處→登出重登看記錄→上傳文件→索引後問其內容→換帳號驗隔離。
- 煙霧測試腳本：對真 Cloudflare 問一題，部署前執行。

## 前置條件（實作前需完成）

- 使用者於 Cloudflare 建立 AI Search 實例（綁 `ntpc-edu-bills`）並提供實例名稱。
- 建立 AI Search API token（權限 AI Search: Run）與 Account ID，填入後端 `.env`。

## 不在本次範圍

- 雲端／局端部署（下一階段）
- 管理介面（帳號管理、文件刪除）
- 前端單元測試框架
- 文件預覽
- 爬蟲資料更新流程（爬蟲 repo 待向原作者取得）
