# 金屬表面處理產業研究網站

純 HTML/CSS/JS 靜態網站，不需要任何建置工具（不需 Node.js），可直接部署到 GitHub Pages。

## 網站結構

```
index.html              首頁（簡介 + 最新新聞）
news.html               產業新聞列表（可依地區、主題標籤篩選）
article.html            單篇新聞詳細頁（網址加 ?id=xxx）
about.html              關於本站
assets/css/style.css    全站樣式
assets/js/news-data.js  新聞/案例資料（由 scripts/sync_notion.py 自動產生，請勿手動編輯）
assets/js/main.js       列表渲染與篩選邏輯
assets/images/synced/   從 Notion 同步下來的圖片（自動產生）
scripts/sync_notion.py  Notion 同步腳本
.env                     存放 Notion API 金鑰（不會上傳到 GitHub）
```

## 本機預覽

在這個資料夾下執行：

```bash
python3 -m http.server 8000
```

然後在瀏覽器開啟 http://localhost:8000

## 如何新增一則新聞 / 文章（從 Notion 同步）

內容來源是你的 Notion 資料庫「表面處理國內外新聞」。流程如下：

1. 在 Notion 資料庫中新增一筆資料（填寫名稱、國家、案例類型/應用領域/關鍵字、網站連結，並在頁面內容中放入說明文字與一張圖片）。
2. 在這個資料夾下執行同步腳本：
   ```bash
   pip3 install -r requirements.txt   # 第一次執行前安裝套件（requests、Pillow）
   python3 scripts/sync_notion.py
   ```
3. 腳本會自動：
   - 重新查詢整個 Notion 資料庫
   - 下載每篇第一張圖片到 `assets/images/synced/`（並自動壓縮）
   - 重新產生 `assets/js/news-data.js`
4. 重新整理網頁即可看到新內容。

**注意**：`assets/js/news-data.js` 是自動產生的檔案，每次執行同步都會被整個覆寫，請不要手動編輯它（否則下次同步會被蓋掉）。

### Notion 端設定（已完成，供未來參考）

- `.env` 內需要 `NOTION_TOKEN`（Integration token）與 `NOTION_DATABASE_ID`（資料庫 ID）。
- 該資料庫需要在 Notion 的「連結 (Connections)」中加入這個 Integration，否則 API 會回 404。

## 部署到 GitHub Pages

1. 在 GitHub 建立一個新的 repository（例如 `surface-treatment-web`）。
2. 在這個資料夾執行：
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/<你的帳號>/<repo名稱>.git
   git push -u origin main
   ```
3. 到 GitHub repo 的 **Settings → Pages**，Source 選擇 `main` branch、目錄選 `/ (root)`，儲存。
4. 幾分鐘後即可透過 `https://<你的帳號>.github.io/<repo名稱>/` 瀏覽網站。

## 已知限制

- 目前只會抓取每篇 Notion 頁面中的「第一張圖片」與所有文字段落作為摘要；複雜排版（如多欄、影片、嵌入）不會被同步。
- `關於本站` 中的「鈦關鍵 / 鈦新聞」區塊為預留位置，可自行補充內容。
- 部分新聞項目在 Notion 中沒有填寫「國家」或標籤，網站上會顯示為沒有地區/標籤。
