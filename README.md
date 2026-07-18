# 新北市教育局議案 RAG 系統

供教育局同仁查詢議會教育類議案的問答系統：以自然語言提問，AI 根據議案資料庫回答並附出處。

## 架構

```
React 前端 ──► FastAPI 後端（登入/聊天記錄/上傳） ──► Cloudflare R2（文件儲存）
                                                  └─► Cloudflare AI Search（向量索引與生成）
```

檢索與生成由 Cloudflare AI Search 全自動處理（實例：`edu-bills-search`，綁定 R2 bucket `ntpc-edu-bills`）。後端負責身分驗證、聊天記錄（各使用者隔離）、上傳簽名網址。詳見 [docs/architecture.md](docs/architecture.md) 與 [docs/superpowers/specs/](docs/superpowers/specs/)。

> **從零建置 Cloudflare（換帳號／交接必看）**：R2 bucket、兩組權杖、AI Search 實例的完整可複製步驟見 [docs/cloudflare-setup.md](docs/cloudflare-setup.md)，含 `bucket unauthorized` 索引失敗的排解。

## 目錄結構

| 路徑 | 內容 |
|---|---|
| `frontend/` | React 19 + TypeScript + Vite 前端 |
| `backend/` | FastAPI 後端，原名 yarag（**獨立 git repo**，不在本 repo 版控內） |
| `data/` | 議案資料：`html/` 原始網頁、`json/` 結構化、`markdown/` 供索引的轉檔（303 筆） |
| `scripts/` | `json_to_markdown.py` 資料轉檔、`upload_to_r2.py` 批次上傳 |
| `docs/` | 架構文件、設計 spec、實作計畫 |

## 啟動（Docker，建議）

前置：`backend/.env` 需含 R2、Cloudflare AI Search 與 OpenAI 的金鑰設定（參考 `backend/.env.example`，金鑰不進 git）。

| 環境 | 前端 | 後端 | 說明 |
|---|---|---|---|
| dev | http://localhost:3100 | http://localhost:9100 | 程式碼熱重載，資料庫 volume `edu-rag-dev` |
| prod | http://localhost:3200 | http://localhost:9200 | 正式建置＋nginx 同源代理，資料庫 volume `edu-rag-prod` |

```bash
docker compose -f docker-compose.dev.yml up -d --build    # 開發環境
docker compose -f docker-compose.prod.yml up -d --build   # 正式環境

# 建帳號（各環境資料庫獨立，需分別建立）
docker compose -f docker-compose.dev.yml exec backend uv run --no-sync create-user <帳號> <顯示名稱>

# 停止
docker compose -f docker-compose.dev.yml down
```

## 啟動（本機不走 Docker）

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

## 進度報告（每期產出）

固定格式的階段性進度報告，供會議簡報與交接留存。

```bash
# 1) 取得該期開發素材（兩個 repo 的提交、統計、測試數）
./scripts/report-data.sh 2026-07-19 2026-07-31

# 2) 複製模板另存新檔，把所有「【...】」佔位文字換掉
cp docs/report-template.html "docs/進度報告_2026-07-19_至_07-31.html"

# 3) 轉成 PDF（會議發送用）
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --no-pdf-header-footer \
  --print-to-pdf="docs/進度報告_2026-07-19_至_07-31.pdf" \
  "file://$PWD/docs/進度報告_2026-07-19_至_07-31.html"
```

模板結構：開場摘要 → 開發時間軸（階段可增減，加 `crit` class 標示故障排除）→ 功能優化說明（卡片，含改善前後對比）→ 下一步規劃。深淺色主題自動切換，適合投影。

範例：[docs/進度報告_2026-07-01_至_07-18.html](docs/進度報告_2026-07-01_至_07-18.html)
