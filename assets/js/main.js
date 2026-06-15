// 共用渲染邏輯：首頁精選新聞、新聞列表頁（含篩選）、單篇文章頁

function getSortedNews() {
  return [...window.NEWS_DATA].sort((a, b) => (a.date < b.date ? 1 : -1));
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderCard(item) {
  const imageHtml = item.image
    ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.parentElement.classList.add('no-image'); this.remove(); this.parentElement.textContent='無圖片';">`
    : "";

  const tags = [];
  if (item.region) tags.push(`<span class="tag region">${escapeHtml(item.region)}</span>`);
  (item.tags || []).slice(0, 4).forEach((t) => tags.push(`<span class="tag">${escapeHtml(t)}</span>`));

  return `
    <article class="card">
      <a class="card-link" href="article.html?id=${encodeURIComponent(item.id)}">
        <div class="card-image${item.image ? "" : " no-image"}">${imageHtml || "無圖片"}</div>
        <div class="card-body">
          <div class="card-meta">${formatDate(item.date)}</div>
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          <div class="tag-list">${tags.join("")}</div>
        </div>
      </a>
    </article>
  `;
}

function renderHomeNews() {
  const container = document.getElementById("home-news-grid");
  if (!container) return;
  const items = getSortedNews().slice(0, 8);
  container.innerHTML = items.map(renderCard).join("");
}

function renderNewsList() {
  const container = document.getElementById("news-grid");
  if (!container) return;

  const allItems = getSortedNews();

  // 收集所有地區與標籤，用於篩選器
  const regions = new Set();
  const tags = new Set();
  allItems.forEach((item) => {
    if (item.region) regions.add(item.region);
    (item.tags || []).forEach((t) => tags.add(t));
  });

  const regionBar = document.getElementById("filter-region");
  const tagBar = document.getElementById("filter-tag");
  const countEl = document.getElementById("filter-count");

  const state = { region: null, tag: null };

  function buildChips(container, values, key) {
    container.innerHTML = "";
    const allChip = document.createElement("button");
    allChip.className = "filter-chip active";
    allChip.textContent = "全部";
    allChip.dataset.value = "";
    container.appendChild(allChip);

    [...values].sort().forEach((value) => {
      const chip = document.createElement("button");
      chip.className = "filter-chip";
      chip.textContent = value;
      chip.dataset.value = value;
      container.appendChild(chip);
    });

    container.addEventListener("click", (e) => {
      if (!e.target.classList.contains("filter-chip")) return;
      container.querySelectorAll(".filter-chip").forEach((c) => c.classList.remove("active"));
      e.target.classList.add("active");
      state[key] = e.target.dataset.value || null;
      render();
    });
  }

  function render() {
    let filtered = allItems;
    if (state.region) filtered = filtered.filter((item) => item.region === state.region);
    if (state.tag) filtered = filtered.filter((item) => (item.tags || []).includes(state.tag));

    container.innerHTML = filtered.map(renderCard).join("") || '<p class="filter-meta">沒有符合條件的項目。</p>';
    if (countEl) countEl.textContent = `共 ${filtered.length} 筆`;
  }

  if (regionBar) buildChips(regionBar, regions, "region");
  if (tagBar) buildChips(tagBar, tags, "tag");
  render();
}

function renderArticle() {
  const container = document.getElementById("article-content");
  if (!container) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const item = window.NEWS_DATA.find((n) => n.id === id);

  if (!item) {
    container.innerHTML = `
      <p>找不到這篇文章。</p>
      <a class="back-link" href="news.html">&larr; 回到新聞列表</a>
    `;
    document.title = "找不到文章 - 金屬表面處理產業研究";
    return;
  }

  document.title = `${item.title} - 金屬表面處理產業研究`;

  const tags = [];
  if (item.region) tags.push(`<span class="tag region">${escapeHtml(item.region)}</span>`);
  (item.tags || []).forEach((t) => tags.push(`<span class="tag">${escapeHtml(t)}</span>`));

  const imageHtml = item.image
    ? `<div class="article-image"><img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" onerror="this.parentElement.remove();"></div>`
    : "";

  const summaryHtml = item.summary
    ? `<div class="article-body">${escapeHtml(item.summary)}</div>`
    : `<div class="article-body">本則暫無摘要，請點擊下方連結閱讀原文。</div>`;

  container.innerHTML = `
    <a class="back-link" href="news.html">&larr; 回到新聞列表</a>
    <div class="article-header">
      <div class="card-meta">${formatDate(item.date)}</div>
      <h1>${escapeHtml(item.title)}</h1>
      <div class="tag-list">${tags.join("")}</div>
    </div>
    ${imageHtml}
    ${summaryHtml}
    <p class="article-source"><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener">閱讀原文 &rarr;</a></p>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  renderHomeNews();
  renderNewsList();
  renderArticle();
});
