# Cloudflare R2 + AI Search 從零建置指南（可複製、交接用）

本文件說明本系統在 Cloudflare 上的兩個核心元件如何**從頭建立**，供未來換帳號、換環境或交接時照著做。

> 適用對象：接手本專案的人。跟著每一步做即可，不需要先懂 Cloudflare。

---

## 0. 先搞懂架構（30 秒）

```
使用者上傳/查詢
      │
      ▼
FastAPI 後端 ──(A) 用「R2 Account Token」讀寫檔案──►  R2 bucket（存原始檔案）
                                                          │
                                                          │(B) AI Search 用「AI Search Token」
                                                          │    定期讀 R2、切塊、做向量索引
                                                          ▼
後端 ──查詢──► Cloudflare AI Search（向量索引＋生成答案）
```

**關鍵：這裡有「兩組」不同的權杖（token），別搞混：**

| 權杖 | 誰在用 | 做什麼 | 存在哪 |
|---|---|---|---|
| **R2 Account Token** | 後端程式 | 簽發上傳/下載網址、直接讀寫 R2 | `backend/.env`（`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`） |
| **AI Search Token** | Cloudflare AI Search（幕後） | 讓 AI Search 有權限去讀 R2 做索引 | Cloudflare 內部，**不在你的程式裡** |

> ⚠️ **最容易踩的雷**：這兩組是分開的。如果你在 R2 權杖管理頁「刪掉」或「重新產生」了 AI Search 那組，AI Search 就會讀不到 R2，索引全部失敗（錯誤訊息 `Unauthorized to access R2 bucket`）。修法見文末「疑難排解」。

---

## 1. 建立 R2 Bucket

1. 登入 Cloudflare Dashboard → 左側選單 **R2 物件儲存**
2. 點 **建立貯體（Create bucket）**
3. 名稱：`ntpc-edu-bills`（本專案用這個；換環境可自訂，但要跟後端 `.env` 的 `DEFAULT_BUCKET` 一致）
4. 位置：**亞太地區 (APAC)**（離台灣近）
5. 建立完成。**公開存取維持「已停用」**（檔案是內部資料，不對外開放；系統靠後端簽的臨時網址存取，安全）

> ⚠️ **坑 1：位置（region）建立後不能改。** 選錯只能刪掉重建（要重傳所有檔案）。台灣就選 APAC。
> ⚠️ **坑 2：bucket 名稱要跟後端 `.env` 的 `DEFAULT_BUCKET` 一字不差。** 不一致的話後端會對不存在的 bucket 讀寫，出現 `NoSuchBucket`。
> ⚠️ **坑 3：不要開「公開存取」。** 一開就等於把內部議案檔案掛上一個任何人可下載的公開網址。維持「已停用」。

---

## 2. 建立「R2 Account Token」（後端用）

1. R2 首頁右下角 **帳戶詳細資訊 → API 令牌 → 管理**
   （或直接開 `https://dash.cloudflare.com/<帳戶ID>/r2/api-tokens`）
2. 點 **建立 Account API 權杖**（選 Account 級，不要選 User 級——User 級在你離開組織後會失效）
3. 設定：
   - 名稱：`R2 Account Token`
   - 權限：**物件讀取和寫入（Object Read & Write）**
   - 套用範圍：指定貯體 `ntpc-edu-bills`
4. 建立後會顯示一次性的：
   - **Access Key ID** → 填入 `.env` 的 `AWS_ACCESS_KEY_ID`
   - **Secret Access Key** → 填入 `.env` 的 `AWS_SECRET_ACCESS_KEY`
   - **S3 API 端點**（形如 `https://<帳戶ID>.r2.cloudflarestorage.com`）→ 填入 `ENDPOINT_URL`

> ⚠️ **坑 1：Secret 只顯示這一次。** 關掉視窗就再也看不到，當下沒複製到 `.env` 就只能刪掉重建一組。
> ⚠️ **坑 2：這組 token 千萬別跟第 4 步 AI Search 的「幕後權杖」搞混。** 兩組長很像、都列在 API 權杖頁。**在權杖頁刪 token 前，務必看清楚名稱**——刪錯 AI Search 那組，索引會整批掛掉（本專案就踩過，見文末）。建議把這組命名清楚為 `R2 Account Token`、AI Search 那組保持它自動產生的 `AI Search Token - 日期`。
> ⚠️ **坑 3：選 Account 級、不要選 User 級。** User 級綁在「你這個人」，你畢業/離開組織後會失效，正式系統會突然沒權限。

---

## 3. 設定 R2 的 CORS（讓瀏覽器能直接上傳／預覽）

前端是「瀏覽器直接把檔案 PUT 到 R2、直接 GET 預覽」，所以 R2 要允許前端網域。

1. 進 bucket `ntpc-edu-bills` → **設定 → CORS 原則 → 編輯**
2. 加入下列規則（開發用；上正式機時把正式網域也加進來）：
   - **允許的原點（AllowedOrigins）**：
     ```
     http://localhost:3100
     http://127.0.0.1:3100
     http://localhost:3200
     http://127.0.0.1:3200
     http://localhost:5173
     http://127.0.0.1:5173
     ```
   - **允許的方法（AllowedMethods）**：`GET`, `PUT`
   - **允許的標頭（AllowedHeaders）**：`content-type`
3. 儲存。

> ⚠️ **坑 1：上正式機一定要把正式網域加進 AllowedOrigins。** CORS 是「逐網域白名單」，只設了 localhost 的話，正式站的瀏覽器上傳/預覽會被擋（症狀：`Failed to fetch`、主控台一堆 CORS 紅字）。
> ⚠️ **坑 2：CORS 只能在 Dashboard 設，程式設不了。** 物件級的 R2 token 沒有設 bucket CORS 的權限，一定要人工在這頁操作。
> ⚠️ **坑 3：origin 要完全比對，含 http/https 與 port。** `http://localhost:3100` 與 `http://localhost:3200` 是兩個不同 origin，各自都要列。

---

## 4. 建立 AI Search 實例（含它自己的幕後權杖）

1. 左側選單 **AI → AI 搜尋（AI Search / AutoRAG）**
   （或直接開 `https://dash.cloudflare.com/<帳戶ID>/ai/ai-search`）
2. 點右上 **＋ 建立實例**
3. **名稱與來源**：
   - 實例名稱：`edu-bills-search`（要跟後端 `.env` 的 `CF_AI_SEARCH_INSTANCE` 一致）
   - 命名空間：`default`
4. **設定來源**：
   - 資料來源：選 R2 bucket `ntpc-edu-bills`
   - **API 令牌：選「＋ 建立新權杖」**（顯示「將自動建立新權杖」）
     👉 **這一步很重要**——讓 Cloudflare 自動配一組能讀 R2 的 AI Search 幕後權杖。若跳出授權視窗，按同意。
   - 路徑過濾：無（要索引整個 bucket）
5. **檢閱設定**：全部用「智慧型預設」即可，不用改
   - 索引：1024 tokens、10% 重疊
   - 檢索：10 筆結果、分數門檻 0.4
   - 快取：開
6. **建立**。建立後會自動開始索引整個 bucket（幾分鐘到十幾分鐘，PDF 較慢）。

> 索引狀態：進實例 → 概觀，看「已編製索引」數字往上跑、「錯誤」為 0 就對了。

> ⚠️ **坑 1（最重要）：API 令牌一定要選「＋ 建立新權杖」。** 若在下拉選單挑了一組舊的、已失效的 token，新實例照樣讀不到 R2、索引全錯（`bucket unauthorized`）。讓它自動新建最保險。
> ⚠️ **坑 2：實例名稱要跟 `.env` 的 `CF_AI_SEARCH_INSTANCE` 一致。** 不一致的話後端會查一個不存在的實例，聊天回 404/認證錯誤。
> ⚠️ **坑 3：索引不是即時的。** 上傳完不會馬上能搜到，Cloudflare 排程觸發，通常幾分鐘~十幾分鐘。急的話進實例按「同步」強制開始。
> ⚠️ **坑 4：掃描檔 PDF（純圖片、沒有文字層）索引不到內容。** AI Search 只能讀出可選取的文字。若某份 PDF 怎樣都搜不到，先確認它不是「整頁掃描的圖」——需要的話先做 OCR 轉成有文字的檔再上傳。
> ⚠️ **坑 5：AI Search 目前是測試版（Beta）。** Cloudflare 可能調整介面或行為；本文件截圖式步驟以 2026-07 為準，若畫面對不上以官方文件為準。

---

## 5. 上傳議案資料到 R2

資料流程：議會爬蟲的 JSON → 轉 Markdown → 上傳 R2 → AI Search 自動索引。

```bash
# 1) JSON 轉 Markdown（讀 data/json/，輸出 data/markdown/）
python3 scripts/json_to_markdown.py

# 2) 上傳到 R2 的 bills/ 前綴（會讀 backend/.env 的 R2 金鑰）
cd backend && uv run python ../scripts/upload_to_r2.py
```

上傳後 AI Search 會在下一個同步週期自動索引；想馬上建，進實例按「同步」。

> 使用者透過前端上傳的檔案，走的是另一條路（後端簽 presigned URL → 瀏覽器直傳 R2 的 `日期/uuid8-檔名`），一樣會被 AI Search 索引。

> ⚠️ **坑 1：Dashboard 手動拖拉上傳一次有數量上限（約 100 個檔）。** 大量檔案用 `scripts/upload_to_r2.py` 批次上傳，別在網頁一個個拉。
> ⚠️ **坑 2：跑 `upload_to_r2.py` 前 `backend/.env` 要先填好 R2 金鑰。** 腳本靠這些值連線，沒填會直接失敗。
> ⚠️ **坑 3：只有 AI Search 支援的格式才會被索引。** Markdown、純文字、含文字層的 PDF、Word 沒問題；純圖片、影片、壓縮檔會被跳過並記為錯誤（屬正常，不影響其他檔）。

---

## 6. 填好後端 `.env`

`backend/.env`（**絕不進 git**，已在 `.gitignore`）需要以下變數：

```bash
# ── R2（第 2 步取得）──
ENDPOINT_URL="https://<帳戶ID>.r2.cloudflarestorage.com"
AWS_ACCESS_KEY_ID="<R2 Account Token 的 Access Key ID>"
AWS_SECRET_ACCESS_KEY="<R2 Account Token 的 Secret>"
REGION_NAME="auto"
DEFAULT_BUCKET="ntpc-edu-bills"
DEFAULT_EXPIRES_IN=300

# ── Cloudflare AI Search ──
CF_ACCOUNT_ID="<你的 Cloudflare 帳戶 ID>"
CF_AI_SEARCH_INSTANCE="edu-bills-search"     # 第 4 步的實例名稱
CF_API_TOKEN="<有『AI 搜尋：索引＋執行』權限的 API Token>"

# ── 登入／資料庫 ──
JWT_SECRET="<隨機長字串，openssl rand -hex 32>"
DATABASE_URL="sqlite:////data/dev.db"        # 本機可用 sqlite；正式可換 Postgres

# ── OpenAI 網路搜尋備援 ──
OPENAI_API_KEY="<OpenAI API Key>"
OPENAI_MODEL="gpt-5-mini"
```

> `CF_API_TOKEN` 是後端「查詢」AI Search 用的（跟第 4 步 AI Search 讀 R2 的幕後權杖不是同一個）。
> 建立方式：Cloudflare → 我的個人資料 → API 權杖 → 建立，權限選 **AI 搜尋（AI Search）：索引 + 執行**。

> ⚠️ **坑 1：`CF_API_TOKEN` 權限給太少，部分操作會回 401「Authentication error」。** 只給「索引+執行」時，`search` / 聊天可正常，但查詢同步工作（`/jobs`）、觸發同步（`/sync`）等管理型端點會 401（本專案實測踩過）。後端聊天功能只需「索引+執行」即可；若要用程式管理索引，權限要再放寬。
> ⚠️ **坑 2：`DATABASE_URL` 的 sqlite 路徑是「四條斜線」才是絕對路徑。** `sqlite:////data/dev.db`（三斜線=相對、四斜線=絕對 `/data/dev.db`）。Docker 掛載到 `/data`，少一條斜線會寫到別的地方、重啟資料就不見。
> ⚠️ **坑 3：`JWT_SECRET` 一定要用隨機長字串**（`openssl rand -hex 32`），別用 `secret`、`123456` 這種。這是簽登入 token 的鑰匙，被猜到等於任何人都能偽造登入。換了這個值會讓所有現有登入失效（需重新登入），屬正常。
> ⚠️ **坑 4：資料夾若曾更名，Python 虛擬環境要重裝**：`cd backend && uv sync --reinstall`，否則會找不到套件。

---

## 7. 驗證整條線通了

```bash
# 對真 Cloudflare AI Search 問一題（會回答＋附出處）
cd backend && uv run python scripts/smoke_cloudflare.py "尖山國中相關議案"
```

有正確回答並附上 `bills/xxxxx.md` 之類的出處，就代表 R2 + AI Search 全線正常。

---

## 疑難排解

### ❌ 索引全部失敗，錯誤：`Unauthorized to access R2 bucket` / `bucket unauthorized`

**原因**：AI Search 那組「幕後權杖」被刪掉或失效了（常見於在 R2 權杖頁誤刪、或重新產生了那組 token）。舊索引還能查，但一同步就整批失敗。

**修法（重建實例，R2 檔案不受影響）**：
1. AI 搜尋 → **＋ 建立實例**
2. 名稱用**新的**（例如 `edu-bills-search-v2`，因為舊的還在、不能同名）
3. 資料來源選 `ntpc-edu-bills`
4. **API 令牌選「＋ 建立新權杖」**（重新配一組有效的）
5. 建立 → 等它索引完
6. 把 `backend/.env` 的 `CF_AI_SEARCH_INSTANCE` 改成新名字 → 重啟後端
7. 驗證正常後，回去把舊的壞實例刪掉

> 為什麼要「先建新的再刪舊的」：舊實例的索引還能查，保留它，新實例確認可用後再刪，中間不會有服務空窗。

### ❌ 前端上傳／預覽出現 `Failed to fetch` 或 CORS 錯誤

檢查第 3 步的 R2 CORS 是否包含你當下用的前端網域（含 port）。

### ❌ 上傳的 PDF 一直搜不到

Cloudflare 索引是排程觸發，非即時。進 AI Search 實例按「同步」可強制開始；PDF 需解析文字，比 Markdown 慢。若超過 20 分鐘仍搜不到，先確認沒有上面的 `bucket unauthorized` 錯誤。

---

## 坑總表（快速查閱）

| 步驟 | 坑 | 解法 |
|---|---|---|
| 建 bucket | region 建立後不能改 | 台灣選 APAC，選錯只能重建 |
| 建 bucket | 名稱與 `DEFAULT_BUCKET` 不一致 | 兩邊一字不差 |
| R2 Token | Secret 只顯示一次 | 當下就複製進 `.env` |
| R2 Token | 誤刪 AI Search 幕後權杖 | 刪 token 前看清楚名稱；兩組分開命名 |
| R2 Token | 用 User 級，畢業後失效 | 選 Account 級 |
| CORS | 上正式機沒加正式網域 | AllowedOrigins 補正式網域（含 port） |
| AI Search | 沒選「建立新權杖」 | 一律讓它自動新建 token |
| AI Search | 實例名與 `CF_AI_SEARCH_INSTANCE` 不一致 | 兩邊一致 |
| AI Search | 索引非即時 | 等，或按「同步」 |
| AI Search | 掃描檔 PDF 無文字層 | 先 OCR 再上傳 |
| 上傳 | 網頁一次上傳 ~100 檔上限 | 大量用 `upload_to_r2.py` |
| `.env` | `CF_API_TOKEN` 權限不足 → 401 | 聊天用「索引+執行」即可；管理索引要放寬 |
| `.env` | sqlite 路徑少一斜線 | 絕對路徑是四斜線 `sqlite:////data/dev.db` |
| 索引全掛 | `bucket unauthorized` | 重建實例＋建立新權杖（見「疑難排解」） |

---

## 附錄：本專案目前的實際值（交接參考）

| 項目 | 值 |
|---|---|
| Cloudflare 帳戶信箱 | 112155020@g.nccu.edu.tw |
| R2 bucket | `ntpc-edu-bills`（APAC） |
| AI Search 實例 | `edu-bills-search`（若重建過則為 `-v2` 等新名） |
| Embedding 模型 | `@cf/qwen/qwen3-embedding-0.6b`（預設） |

> 實際金鑰值只存在 `backend/.env`，不寫進本文件、不進 git。

> ⚠️ **交接最大風險：帳號綁在學校信箱 `112155020@g.nccu.edu.tw`。** 畢業後這信箱可能被學校回收，屆時會無法登入 Cloudflare、無法重設密碼，整個 R2 + AI Search 形同失聯。**交接前務必：**
> 1. 把 Cloudflare 帳號的登入信箱改成長期有效的信箱（單位公用信箱最佳），或
> 2. 在 Cloudflare 加入接手者為成員（Members），確保不只一個人進得去，或
> 3. 至少把帳號密碼、`backend/.env` 內容用安全方式交給接手單位。
> 同理，**OpenAI 帳號**（`OPENAI_API_KEY` 來源）也要確認付款與帳號歸屬，避免卡在個人信用卡或個人信箱。
