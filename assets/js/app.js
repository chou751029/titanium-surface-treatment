// Chou's 金屬產業分享園地 — Shared App Logic
(function () {
  'use strict';

  /* ── Helpers ──────────────────────────────────────── */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  }

  function fmtDate(s) {
    if (!s) return '';
    var d = new Date(s + 'T00:00:00');
    return isNaN(d.getTime()) ? s : d.toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function fmtDot(s) { return (s || '').replace(/-/g, '.'); }

  function clip(s, len) {
    var x = (s || '').replace(/\s+/g, ' ').trim();
    len = len || 72;
    return x.length > len ? x.slice(0, len) + '…' : x;
  }

  function buildCard(item, noImgClass) {
    var meta = [item.region].concat((item.tags || []).slice(0, 2)).filter(Boolean).join(' · ');
    var niClass = noImgClass || '';
    var cover = item.image
      ? '<div class="card-cover" style="background-image:url(\'' + esc(item.image) + '\')"></div>'
      : '<div class="card-cover card-cover-placeholder ' + esc(niClass) + '"><span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:#A89E8C;">無封面圖</span></div>';
    return '<a class="card" href="article.html?id=' + encodeURIComponent(item.id) + '">'
      + cover
      + '<div class="card-body">'
      + '<div class="card-meta">' + esc(meta) + '</div>'
      + '<div class="card-title">' + esc(item.title || '未命名') + '</div>'
      + '<div class="card-excerpt">' + esc(clip(item.summary)) + '</div>'
      + '<div class="card-date">' + esc(fmtDot(item.date)) + '</div>'
      + '</div></a>';
  }

  /* ── Nav active state ────────────────────────────── */

  function setNavActive() {
    var page = document.body.dataset.page;
    if (!page) return;
    document.querySelectorAll('.site-nav-link[data-page]').forEach(function (l) {
      l.classList.toggle('active', l.dataset.page === page);
    });
  }

  /* ── Home page ───────────────────────────────────── */

  function initHome() {
    var DATA = window.NEWS_DATA || [];
    if (!DATA.length) return;
    var sorted = DATA.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var featEl = document.getElementById('featured-area');
    if (featEl && sorted[0]) {
      var f = sorted[0];
      var cover = f.image
        ? '<div class="featured-img" style="background-image:url(\'' + esc(f.image) + '\')"></div>'
        : '<div class="featured-img featured-img-placeholder"></div>';
      featEl.innerHTML = '<a href="article.html?id=' + encodeURIComponent(f.id) + '" class="featured-grid" style="text-decoration:none;color:inherit;">'
        + cover
        + '<div class="featured-body">'
        + '<div class="featured-meta"><span class="featured-badge">表面處理</span><span class="featured-date">' + esc(fmtDot(f.date)) + '</span></div>'
        + '<div class="featured-title">' + esc(f.title) + '</div>'
        + '<div class="featured-excerpt">' + esc(clip(f.summary, 120)) + '</div>'
        + '<span class="featured-link">閱讀全文 →</span>'
        + '</div></a>';
    }

    var latestEl = document.getElementById('home-latest');
    if (latestEl) {
      latestEl.innerHTML = sorted.slice(1, 4).map(function (i) { return buildCard(i); }).join('');
    }
  }

  /* ── Generic news list ───────────────────────────── */

  function initNewsList(opts) {
    var grid = document.getElementById(opts.gridId);
    if (!grid) return;
    var countEl  = document.getElementById(opts.countId);
    var DATA     = window[opts.dataVar] || [];
    var sorted   = DATA.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var regionSet = [], tagSet = [];
    sorted.forEach(function (a) {
      if (a.region && regionSet.indexOf(a.region) === -1) regionSet.push(a.region);
      (a.tags || []).forEach(function (t) { if (tagSet.indexOf(t) === -1) tagSet.push(t); });
    });
    regionSet.sort(); tagSet.sort();

    var state = { region: '全部', tag: '全部' };

    function setChips(id, vals, activeVal, key) {
      var c = document.getElementById(id);
      if (!c) return;
      c.innerHTML = '';
      ['全部'].concat(vals).forEach(function (v) {
        var btn = document.createElement('button');
        btn.className = 'filter-chip' + (v === activeVal ? ' active' : '');
        btn.textContent = v;
        btn.addEventListener('click', function () { state[key] = v; render(); });
        c.appendChild(btn);
      });
    }

    function render() {
      setChips(opts.regionId, regionSet, state.region, 'region');
      setChips(opts.tagId,    tagSet,    state.tag,    'tag');
      var filtered = sorted;
      if (state.region !== '全部') filtered = filtered.filter(function (a) { return a.region === state.region; });
      if (state.tag    !== '全部') filtered = filtered.filter(function (a) { return (a.tags || []).indexOf(state.tag) !== -1; });
      grid.innerHTML = filtered.length
        ? filtered.map(function (a) { return buildCard(a, opts.noImgClass); }).join('')
        : '<div class="no-results">沒有符合條件的項目。</div>';
      if (countEl) countEl.textContent = filtered.length + ' 篇文章';
    }

    render();
  }

  /* ── Article page ────────────────────────────────── */

  function initArticle() {
    var container = document.getElementById('article-content');
    if (!container) return;

    var DATA = (window.NEWS_DATA || []).concat(window.TITANIUM_DATA || []);
    var id   = new URLSearchParams(window.location.search).get('id');
    var item = DATA.find(function (n) { return n.id === id; });
    var coverEl = document.getElementById('article-cover');

    if (!item) {
      container.innerHTML = '<p style="color:#5E574C;font-size:15px;">找不到這篇文章。</p>'
        + '<a class="article-back" href="news.html">← 回到新聞列表</a>';
      return;
    }

    document.title = item.title + " - Chou's 金屬產業分享園地";

    if (coverEl) {
      if (item.image) {
        coverEl.style.backgroundImage = 'url("' + esc(item.image) + '")';
        coverEl.style.display = 'block';
      } else {
        coverEl.style.display = 'none';
      }
    }

    var tags = [item.region].concat(item.tags || []).filter(Boolean);
    container.innerHTML =
      '<a class="article-back" href="javascript:history.back()">← 返回</a>'
      + '<div class="article-tags">' + tags.map(function (t) { return '<span class="article-tag">' + esc(t) + '</span>'; }).join('') + '</div>'
      + '<div class="article-title">' + esc(item.title) + '</div>'
      + '<div class="article-date">' + esc(fmtDate(item.date)) + '</div>'
      + '<div class="article-body">' + esc(item.summary || '本則暫無摘要，請點擊下方連結閱讀原文。') + '</div>'
      + '<div class="article-source"><a href="' + esc(item.sourceUrl || '#') + '" target="_blank" rel="noopener">閱讀原文 →</a></div>';
  }

  /* ── Search page ─────────────────────────────────── */

  function initSearch() {
    var grid = document.getElementById('search-grid');
    if (!grid) return;
    var q  = (new URLSearchParams(window.location.search).get('q') || '').trim();
    var ql = q.toLowerCase();
    var headingEl = document.getElementById('search-heading');
    var countEl   = document.getElementById('search-count');

    if (headingEl) headingEl.textContent = q ? '搜尋「' + q + '」' : '搜尋';

    var DATA   = (window.NEWS_DATA || []).concat(window.TITANIUM_DATA || []);
    var sorted = DATA.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });

    var filtered = ql ? sorted.filter(function (a) {
      var hay = ((a.title || '') + ' ' + (a.summary || '') + ' ' + (a.region || '') + ' ' + (a.tags || []).join(' ')).toLowerCase();
      return hay.indexOf(ql) !== -1;
    }) : [];

    grid.innerHTML = filtered.length
      ? filtered.map(function (a) { return buildCard(a); }).join('')
      : (q ? '<div class="no-results">找不到符合「' + esc(q) + '」的文章。</div>'
           : '<div class="no-results">請輸入搜尋關鍵字。</div>');

    if (countEl) countEl.textContent = q ? (filtered.length + ' 篇符合的文章') : '';
  }

  /* ── Boot ────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    setNavActive();
    initHome();
    initNewsList({ gridId: 'news-grid', countId: 'news-count', regionId: 'filter-region', tagId: 'filter-tag', dataVar: 'NEWS_DATA' });
    initNewsList({ gridId: 'titanium-grid', countId: 'titanium-count', regionId: 'filter-ti-region', tagId: 'filter-ti-tag', dataVar: 'TITANIUM_DATA', noImgClass: 'card-cover-placeholder-ti' });
    initArticle();
    initSearch();
  });

}());
