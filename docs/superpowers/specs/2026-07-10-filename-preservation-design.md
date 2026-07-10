# 上傳檔名保留與點擊下載設計

日期：2026-07-10
狀態：使用者已核准方向（顯示原始檔名＋點名稱下載）

## 需求

1. 文件列表顯示使用者上傳時的原始檔名（既有 303 筆議案檔照舊顯示議案編號檔名）
2. 點擊文件名稱可下載該檔案（原始檔名、原封內容）
3. 聊天出處若引用上傳檔，儘可能顯示可辨識的名稱

## 設計決定：檔名編入 key（對使用者核准的「名牌」做法的技術精化）

原提案為 S3 metadata；改為把清洗後的原始檔名編入物件 key：`YYYY/MM/DD/{uuid8}-{清洗後檔名}`。理由：

- `list_objects_v2` 不回 metadata，逐檔 HEAD 會隨上傳量線性變慢；key 內含名稱則列表零額外請求
- **AI Search 的出處顯示的就是 key**——檔名入 key 讓聊天出處直接變可讀（需求 3 免費達成）
- S3/R2 key 支援 UTF-8（上限 1024 bytes），中文檔名可直接存

清洗規則（後端）：移除路徑分隔符與控制字元、壓縮空白、長度截 80 字元；副檔名不符白名單推導值時以白名單為準。uuid8 前綴避免撞名。

## API 變更

- `POST /api/v1/uploads`：key 生成改為上述格式（其餘不變；4MB/白名單/回應欄位照舊）
- `GET /api/v1/documents`：每項加 `display_name`——取 key 最後一段、剝除 `^[0-9a-f]{8}-` 前綴；議案檔（無前綴）原樣顯示
- 新增 `GET /api/v1/documents/download?key=<key>`（需登入）：回既有 schema `DownloadResponse {download_url, expires_in}`（原作者預留、至今未用）；presigned GET、`ResponseContentDisposition=attachment; filename*=UTF-8''<display_name>`；expires 沿用 settings.default_expires_in；key 不存在回 404

## 前端

- `api.ts`：`DocumentOut` 加 `display_name`；新增 `requestDownloadUrl(key) -> {download_url, expires_in}`
- DocsPage／Dashboard：顯示 `display_name`；名稱改為可點（button 樣式近連結），點擊 → 取下載網址 → `window.open(download_url)`（瀏覽器下載，檔名即原始檔名）；本地 IndexedDB 上傳項維持既有預覽/下載行為
- 上傳頁無 UI 變更（file_name 本來就有送）

## 錯誤處理

- 下載端點：key 格式非法（含 `..`、開頭 `/`）→ 400；presign 失敗 → 500「無法產生下載網址」
- 前端下載失敗 → 既有 toast／alert 模式顯示錯誤

## 測試

- pytest：key 生成（中文檔名、超長截斷、路徑注入清洗、副檔名矯正）；documents display_name（uuid 前綴剝除、議案檔原樣）；download 端點（成功/404/非法 key/未登入 401）
- 端對端：上傳中文檔名檔案 → 列表顯示原名 → 點擊下載成功 → 聊天引用該檔時出處顯示原名

## 不在範圍

- 舊有兩筆亂碼測試檔的改名（可手動刪除）
- 刪除文件功能
