# 如何最快新增一個產業分類

整個網站是「**設定驅動**」的：導覽列、首頁分類卡、搜尋、歸檔、標籤頁、文章頁
全部讀同一份設定 `assets/js/site-config.js`。所以新增一個分類，**不需要新增 HTML 頁面、
不需要改 app.js**，只要兩步：

---

## 步驟 1：讓 Notion 把資料同步成一個 JS 檔

1. 在 Notion 建立（或已有）一個新的資料庫，例如「半導體材料新聞」。
2. 把你的 Notion Integration 連結到這個資料庫（Notion 頁面右上 ⋯ →「連結」）。
3. 在 `.env` 增加這個資料庫的 ID，例如：
   ```
   SEMICON_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. 打開 `scripts/sync_notion.py`，在 `main()` 裡仿照鈦的那段，加上一段同步：
   ```python
   semicon_db_id = os.environ.get("SEMICON_DATABASE_ID")
   if semicon_db_id:
       all_items += sync_database(
           headers,
           normalize_id(semicon_db_id),
           ROOT / "assets" / "js" / "semicon-data.js",   # 輸出檔
           "半導體材料新聞資料",
           "window.SEMICON_DATA",                          # 變數名稱
           build_fn=build_titanium_item,                   # 欄位格式比照鈦資料庫就用這個；表面處理格式則用 build_item
       ) or []
   ```
   > 欄位名稱（標題、國家、標籤、連結）若和現有資料庫不同，可複製一份 `build_titanium_item`
   > 改成自己的欄位對應。

執行 `python3 scripts/sync_notion.py` 後，會多出 `assets/js/semicon-data.js`。

---

## 步驟 2：在 site-config.js 加一筆分類

打開 `assets/js/site-config.js`，在 `SITE_CATEGORIES` 陣列加一筆：

```js
{
  key: 'semicon',                         // 英文代號，全站唯一
  label: '半導體材料新聞',
  short: '半導體',
  eyebrow: 'SEMICONDUCTOR',
  desc: '半導體製程材料、濺鍍靶材與封裝的最新動態。',
  dataVar: 'SEMICON_DATA',                // 對應步驟 1 的變數名稱
  dataFile: 'assets/js/semicon-data.js',  // 對應步驟 1 的輸出檔
  accent: '#7C9CBF',                       // 主題色
  headerBg: '#2B3A4A'                      // 頁首深色底
  // 不用寫 file：會自動用 category.html?cat=semicon
}
```

**完成。** 重新整理網站就會看到：

- 導覽列自動多出「半導體材料新聞」
- 首頁分類卡、各分類最新一排自動出現
- 搜尋、歸檔（月份／地區）、標籤頁自動把新分類的文章納入
- 文章頁自動套用這個分類的顏色、上一篇／下一篇、相關文章

---

## 想給它一個專屬網址（選填）

預設新分類用 `category.html?cat=semicon`。若想要像 `news.html` 那樣的乾淨網址：

1. 複製 `category.html` 成 `semicon.html`。
2. 把 `<body data-page="category">` 改成 `<body data-page="category" data-cat="semicon">`。
3. 在 site-config.js 那筆加上 `file: 'semicon.html'`。

---

## 小提醒

- `assets/js/*-data.js` 都是 `sync_notion.py` 自動產生的，**請勿手動編輯**。
- 要置頂某篇文章到首頁，把它的 id 填進 site-config.js 的 `window.SITE_PINNED`。
- 換網域時，改 site-config.js 的 `SITE_META.siteUrl` 與 sync 腳本的 `SITE_URL`（影響 RSS）。
