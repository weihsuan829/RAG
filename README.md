# 新北市教育局議案 RAG 系統

供教育局同仁查詢議會教育類議案的問答系統：以自然語言提問，AI 根據議案資料庫回答並附出處。

## 架構

```
React 前端 ──► FastAPI 後端（登入/聊天記錄/上傳） ──► Cloudflare R2（文件儲存）
                                                  └─► Cloudflare AI Search（向量索引與生成）
```

檢索與生成由 Cloudflare AI Search 全自動處理（實例：`edu-bills-search`，綁定 R2 bucket `ntpc-edu-bills`）。後端負責身分驗證、聊天記錄（各使用者隔離）、上傳簽名網址。詳見 [docs/architecture.md](docs/architecture.md) 與 [docs/superpowers/specs/](docs/superpowers/specs/)。

## 目錄結構

| 路徑 | 內容 |
|---|---|
| `frontend/` | React 19 + TypeScript + Vite 前端 |
| `backend/` | FastAPI 後端，原名 yarag（**獨立 git repo**，不在本 repo 版控內） |
| `data/` | 議案資料：`html/` 原始網頁、`json/` 結構化、`markdown/` 供索引的轉檔（303 筆） |
| `scripts/` | `json_to_markdown.py` 資料轉檔、`upload_to_r2.py` 批次上傳 |
| `docs/` | 架構文件、設計 spec、實作計畫 |

## 啟動（開發）

前置：`backend/.env` 需含 R2 與 Cloudflare AI Search 的金鑰設定（參考 `backend/.env.example`，金鑰不進 git）。

```bash
# 後端（http://127.0.0.1:8010，API 文件在 /docs）
cd backend && uv sync && uv run dev

# 前端（http://localhost:5173）
cd frontend && npm install && npm run dev
```

前端的 `frontend/.env` 需含 `VITE_API_BASE_URL=http://127.0.0.1:8010`。

## 帳號管理

無自助註冊，帳號由管理者預建：

```bash
cd backend && uv run create-user <帳號> <顯示名稱>   # 互動輸入密碼（至少 8 字元）
```

## 測試

```bash
cd backend && uv run pytest          # 後端測試（30 tests）
cd backend && uv run ruff check src tests scripts
cd frontend && npm run build      # 前端型別檢查＋建置
cd backend && uv run python scripts/smoke_cloudflare.py "測試問題"  # 對真 Cloudflare 的煙霧測試
```

## 資料更新

議案資料來源為議會網站爬蟲（爬蟲程式碼由原作者維護，未在本 repo）。取得新資料後：

```bash
python3 scripts/json_to_markdown.py                    # json → markdown
cd backend && uv run python ../scripts/upload_to_r2.py   # 上傳 R2，AI Search 自動重建索引
```

## 部署注意事項（上雲前必辦）

- 上傳大小限制目前僅驗證前端宣告值，需改為 R2 端強制（POST policy 或事後驗證）
- token 由 localStorage 改 httpOnly cookie；登入加 dummy-hash 時序防護
- SQLite 換 PostgreSQL（改 `DATABASE_URL` 即可，程式碼無 SQLite 相依）
- CORS 白名單改為正式網域（`backend/.env` 的 `CORS_ORIGINS`）
