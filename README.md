# Chou's 金屬產業分享園地

純 HTML / CSS / JS 靜態網站，不需任何建置工具（不需 Node.js），可直接部署到 GitHub Pages。
內容後台是 **Notion**：在 Notion 編輯 → `scripts/sync_notion.py` 同步 → 產生資料檔 → 網站顯示。

## 網站結構

```
index.html                首頁（精選 + 分類 + 各分類最新）
news.html                 表面處理產業新聞（分類頁）
titanium.html             鈦金屬相關新聞（分類頁）
other.html                其他產業（分類頁，待建置）
category.html             通用分類頁（新分類用 category.html?cat=代號）
article.html              單篇文章（?id=xxx）：內文、目錄、閱讀時間、上一篇/下一篇、相關文章
search.html               站內搜尋（多關鍵字 + 高亮 + 分類過濾）
tag.html                  標籤頁（tag.html?tag=xxx）
archive.html              歸檔（月份 / 地區 / 標籤；archive.html?month= / ?region=）
feed.xml                  RSS 訂閱（由 sync 腳本自動產生）

assets/css/chou-style.css 全站樣式（含深色模式）
assets/js/site-config.js  ★ 全站設定：分類、置頂、站台資訊（新增分類改這裡）
assets/js/app.js          全站邏輯（設定驅動，動態載入各分類資料）
assets/js/news-data.js    表面處理資料（sync_notion.py 自動產生，請勿手動編輯）
assets/js/titanium-data.js 鈦資料（自動產生，請勿手動編輯）
assets/images/synced/     從 Notion 同步下來的圖片（自動產生）
scripts/sync_notion.py    Notion 同步腳本（產生資料檔 + feed.xml）
.env                      Notion 金鑰（不上傳 GitHub）
```

> 註：`about.html` 與 `assets/css/style.css`、`assets/js/main.js` 為早期版本檔案，目前主要頁面已不使用。

## 本機預覽

```bash
python3 -m http.server 8000
```
瀏覽器開 http://localhost:8000

## 主要功能

- **首頁**：精選／置頂（可在 site-config.js 的 `SITE_PINNED` 手動置頂）、分類卡、各分類最新。
- **文章頁**：自動斷段內文、長文目錄（≥3 個小標自動產生）、閱讀時間、上一篇／下一篇、相關文章、分享連結。
- **分類頁**：地區／標籤／排序篩選。
- **標籤頁 / 歸檔**：跨分類依標籤、月份、地區瀏覽。
- **搜尋**：多關鍵字（AND）、關鍵字高亮、依分類過濾、熱門標籤建議。
- **深色模式**：導覽列右側 ☾／☀ 切換，記住偏好，並會跟隨系統設定。
- **RSS**：`feed.xml`，頁尾有訂閱連結。

## 從 Notion 同步內容

1. 在 Notion 資料庫新增／修改資料（名稱、國家、標籤、連結，頁面內文放說明與圖片）。
2. 執行：
   ```bash
   pip3 install requests pillow      # 第一次先安裝
   python3 scripts/sync_notion.py
   ```
3. 腳本會：重新查詢 Notion → 下載並壓縮圖片 → 重新產生各 `*-data.js` 與 `feed.xml`。
4. 重新整理網頁即可。

`.env` 需要：
```
NOTION_TOKEN=（Integration token）
NOTION_DATABASE_ID=（表面處理資料庫 ID）
TITANIUM_DATABASE_ID=（鈦資料庫 ID）
# SITE_URL=（選填，自訂網域時用於 RSS 連結）
```
每個資料庫都要在 Notion 的「連結 (Connections)」加入這個 Integration，否則 API 會回 404。

## ★ 如何新增一個產業分類（最快做法）

見 **[README-新增分類.md](README-新增分類.md)** —— 只需：① 在 sync 腳本加一段同步產生資料檔、
② 在 `assets/js/site-config.js` 加一筆分類。導覽列、首頁、搜尋、歸檔、標籤頁全部自動帶入。

## 自動同步（GitHub Actions）

`.github/workflows/sync.yml` 每天台灣時間 08:00 自動執行同步並 commit。
若新增了分類或 feed.xml，記得在該 workflow 的 `git add` 清單加入新的資料檔與 `feed.xml`。

## 部署到 GitHub Pages

Settings → Pages，Source 選 `main` branch、目錄 `/ (root)`。
幾分鐘後即可透過 `https://<帳號>.github.io/<repo>/` 瀏覽。
