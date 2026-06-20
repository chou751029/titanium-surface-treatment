// Chou's 金屬產業分享園地 — 全站設定（單一來源）
// ┌─────────────────────────────────────────────────────────────┐
// │  要新增一個產業分類時，只要在下面 SITE_CATEGORIES 陣列加一筆即可。   │
// │  導覽列、首頁、搜尋、歸檔、標籤頁都會自動帶入，不必再改其他檔案。      │
// │  詳細步驟請見專案根目錄的 README-新增分類.md                       │
// └─────────────────────────────────────────────────────────────┘
//
// 每一筆分類的欄位說明：
//   key       分類代號（英文小寫，網址會用到，全站唯一）
//   label     完整名稱（導覽列、頁首顯示）
//   short     精簡名稱（卡片徽章用）
//   eyebrow   頁首上方的英文小標
//   desc      分類描述（首頁分類卡、頁首副標）
//   dataVar   資料變數名稱（對應 sync_notion.py 產生的 window.XXX_DATA）
//   dataFile  資料檔路徑（sync_notion.py 自動產生）
//   accent    主題色（徽章、連結等）
//   headerBg  頁首深色底色
//   file      （選填）專屬頁面檔名；省略時自動使用 category.html?cat=代號
//   comingSoon（選填）true = 尚未有資料，顯示「即將上線」

window.SITE_CATEGORIES = [
  {
    key: 'news',
    label: '表面處理產業新聞',
    short: '表面處理',
    eyebrow: 'SURFACE TREATMENT',
    desc: '電鍍、塗層、鈍化、陽極處理等表面處理領域的最新新聞與案例。',
    dataVar: 'NEWS_DATA',
    dataFile: 'assets/js/news-data.js',
    accent: '#2A9D8F',
    headerBg: '#264653',
    file: 'news.html'
  },
  {
    key: 'titanium',
    label: '鈦金屬相關新聞',
    short: '鈦金屬',
    eyebrow: 'TITANIUM',
    desc: '鈦合金、航太、醫材與精密製造的最新趨勢與案例。',
    dataVar: 'TITANIUM_DATA',
    dataFile: 'assets/js/titanium-data.js',
    accent: '#E9C46A',
    headerBg: '#1C3E4A',
    file: 'titanium.html'
  },
  {
    key: 'other',
    label: '其他產業',
    short: '其他',
    eyebrow: 'OTHER INDUSTRIES',
    desc: '跨領域材料與製程的延伸筆記與觀察。',
    dataVar: 'OTHER_DATA',
    dataFile: 'assets/js/other-data.js',
    accent: '#F4A261',
    headerBg: '#264653',
    file: 'other.html',
    comingSoon: true
  }
];

// 首頁「置頂／精選」——填入文章 id（卡片或網址 ?id= 後面那串）即可手動置頂，
// 留空則自動以全站最新一篇為精選。可放多筆，順序即顯示順序。
window.SITE_PINNED = [];

// 站台基本資訊（RSS、頁尾共用）
window.SITE_META = {
  title: "Chou's 金屬產業分享園地",
  tagline: 'METAL INDUSTRY NOTES',
  description: '彙整金屬表面處理與鈦產業的最新新聞、技術趨勢與案例分析。',
  // 部署網址（用於 RSS、分享連結）。換網域時改這裡。
  siteUrl: 'https://chou751029.github.io/titanium-surface-treatment/',
  emails: ['chou751029@gmail.com', 'kchou1029@mail.mirdc.org.tw'],
  social: [
    { label: 'LinkedIn', url: 'https://www.linkedin.com/in/po-hsun-chou-8221b285/' },
    { label: 'Facebook', url: 'https://www.facebook.com/kevinchou751029' }
  ]
};
