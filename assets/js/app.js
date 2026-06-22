// Chou's 金屬產業分享園地 — 全站共用邏輯（設定驅動）
// 依 site-config.js 的 SITE_CATEGORIES 自動產生導覽列、頁尾、首頁、列表、
// 文章頁（目錄／閱讀時間／上下篇／相關文章）、搜尋、標籤頁、歸檔頁、深色模式。
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     工具函式
  ══════════════════════════════════════════════════════════ */

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = String(s == null ? '' : s);
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

  // 中文約每分鐘 350 字
  function readingTime(item) {
    var text = (item.summary || '') + ' ' + contentToText(item.content);
    var n = text.replace(/\s+/g, '').length;
    return Math.max(1, Math.round(n / 350));
  }

  function qs(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /* ══════════════════════════════════════════════════════════
     設定 / 資料存取
  ══════════════════════════════════════════════════════════ */

  function cats() { return window.SITE_CATEGORIES || []; }
  function catOf(key) { return cats().filter(function (c) { return c.key === key; })[0] || null; }
  function catHref(c) { return c.file || ('category.html?cat=' + encodeURIComponent(c.key)); }
  function meta() { return window.SITE_META || {}; }

  function dataOf(key) {
    var c = catOf(key);
    if (!c) return [];
    return (window[c.dataVar] || []).map(function (it) {
      var copy = {};
      for (var k in it) copy[k] = it[k];
      copy.category = key;
      return copy;
    });
  }

  // 全站所有文章（含 category 欄位）
  function allItems() {
    var out = [];
    cats().forEach(function (c) { out = out.concat(dataOf(c.key)); });
    return out;
  }

  function byDateDesc(arr) {
    return arr.slice().sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
  }

  function findItem(id) {
    return allItems().filter(function (n) { return n.id === id; })[0] || null;
  }

  /* ══════════════════════════════════════════════════════════
     內文解析（目錄 + 段落）
     優先用結構化 content（未來 Notion 同步會帶），否則用 summary 智慧斷段。
  ══════════════════════════════════════════════════════════ */

  function contentToText(content) {
    if (!Array.isArray(content)) return '';
    return content.map(function (b) { return b.text || ''; }).join(' ');
  }

  // 判斷一行是否像標題（給沒有結構化資料的舊內文用）
  function looksLikeHeading(line) {
    var t = line.trim();
    if (!t || t.length > 34) return false;
    if (/^\d+[\.、\)]\s*\S/.test(t)) return true;            // 1. / 2、/ 3)
    if (/^[一二三四五六七八九十]+[、.\)]\s*\S/.test(t)) return true; // 一、二、
    if (/[：:]$/.test(t) && t.length <= 28) return true;       // 以冒號結尾的短句
    if (/^第[一二三四五六七八九十\d]+[章節部分]/.test(t)) return true;
    return false;
  }

  // 回傳 { blocks:[{type,text,id}], toc:[{text,id}] }
  function parseArticle(item) {
    var blocks = [];
    if (Array.isArray(item.content) && item.content.length) {
      // 結構化內容
      item.content.forEach(function (b) { blocks.push({ type: b.type || 'p', text: b.text || '' }); });
    } else {
      // 從 summary 智慧斷段
      var raw = (item.summary || '').replace(/\r/g, '');
      var paras = raw.split(/\n{2,}/);
      paras.forEach(function (p) {
        var lines = p.split(/\n/);
        lines.forEach(function (ln) {
          var t = ln.trim();
          if (!t) return;
          blocks.push({ type: looksLikeHeading(t) ? 'h' : 'p', text: t });
        });
      });
    }
    // 配標題錨點
    var toc = [];
    var hi = 0;
    blocks.forEach(function (b) {
      if (b.type === 'h' || b.type === 'heading_1' || b.type === 'heading_2' || b.type === 'heading_3') {
        b.type = 'h';
        b.id = 'sec-' + (++hi);
        toc.push({ text: b.text, id: b.id });
      }
    });
    return { blocks: blocks, toc: toc };
  }

  /* ══════════════════════════════════════════════════════════
     卡片
  ══════════════════════════════════════════════════════════ */

  function catBadge(item) {
    var c = catOf(item.category);
    if (!c) return '';
    return '<span class="card-cat-badge" style="background:' + c.accent + ';">' + esc(c.short) + '</span>';
  }

  function buildCard(item, opts) {
    opts = opts || {};
    var c = catOf(item.category);
    var meta = [item.region].concat((item.tags || []).slice(0, 2)).filter(Boolean).join(' · ');
    var niClass = item.category === 'titanium' ? 'card-cover-placeholder-ti' : '';
    var cover = item.image
      ? '<div class="card-cover" style="background-image:url(\'' + esc(item.image) + '\')">' + (opts.showCat ? catBadge(item) : '') + '</div>'
      : '<div class="card-cover card-cover-placeholder ' + niClass + '">' + (opts.showCat ? catBadge(item) : '') + '<span class="card-cover-empty">無封面圖</span></div>';
    var title = opts.highlight ? highlight(item.title || '未命名', opts.highlight) : esc(item.title || '未命名');
    var excerpt = opts.highlight ? highlight(clip(item.summary), opts.highlight) : esc(clip(item.summary));
    return '<a class="card" href="article.html?id=' + encodeURIComponent(item.id) + '">'
      + cover
      + '<div class="card-body">'
      + '<div class="card-meta">' + esc(meta) + '</div>'
      + '<div class="card-title">' + title + '</div>'
      + '<div class="card-excerpt">' + excerpt + '</div>'
      + '<div class="card-foot"><span class="card-date">' + esc(fmtDot(item.date)) + '</span><span class="card-read">' + readingTime(item) + ' 分鐘</span></div>'
      + '</div></a>';
  }

  function highlight(text, terms) {
    var safe = esc(text);
    terms.forEach(function (t) {
      if (!t) return;
      var re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      safe = safe.replace(re, '<mark>$1</mark>');
    });
    return safe;
  }

  /* ══════════════════════════════════════════════════════════
     共用框架：導覽列 + 頁尾 + 深色模式
  ══════════════════════════════════════════════════════════ */

  function renderChrome() {
    var m = meta();
    var page = document.body.dataset.page;
    var activeCat = document.body.dataset.cat || qs('cat');

    var header = document.getElementById('site-header');
    if (header) {
      var links = '<a href="index.html" class="site-nav-link"' + (page === 'home' ? ' data-on="1"' : '') + '>首頁</a>';
      cats().forEach(function (c) {
        var on = (page === 'category' && activeCat === c.key);
        links += '<a href="' + catHref(c) + '" class="site-nav-link"' + (on ? ' data-on="1"' : '') + '>' + esc(c.label) + '</a>';
      });
      links += '<a href="archive.html" class="site-nav-link"' + (page === 'archive' ? ' data-on="1"' : '') + '>歸檔</a>';
      links += '<a href="contact.html" class="site-nav-link"' + (page === 'contact' ? ' data-on="1"' : '') + '>聯絡</a>';

      header.className = 'site-nav-wrap';
      header.innerHTML =
        '<nav class="site-nav">'
        + '<a href="index.html" class="site-logo"><span class="site-logo-title">' + esc(m.title) + '</span><span class="site-logo-sub">' + esc(m.tagline) + '</span></a>'
        + '<div class="site-nav-right">'
        + '<div class="site-nav-links">' + links + '</div>'
        + '<form class="site-search-form" action="search.html" method="get"><span class="site-search-icon">⌕</span><input class="site-search-input" name="q" type="search" placeholder="搜尋全站新聞…" autocomplete="off" value="' + esc(qs('q') || '') + '"></form>'
        + '<button class="theme-toggle" id="theme-toggle" type="button" aria-label="切換深色模式"></button>'
        + '</div></nav>';
    }

    var footer = document.getElementById('site-footer');
    if (footer) {
      var emails = (m.emails || []).map(function (e) { return '<div>' + esc(e) + '</div>'; }).join('');
      var social = (m.social || []).map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>'; }).join('');
      footer.className = 'site-footer';
      footer.innerHTML =
        '<div class="site-footer-inner">'
        + '<div><div class="footer-brand-title">' + esc(m.title) + '</div><div class="footer-brand-desc">' + esc(m.description) + '</div>'
        + '<a class="footer-rss" href="feed.xml"><span>◈</span> RSS 訂閱</a></div>'
        + '<div class="footer-contact">' + emails + '<div class="footer-social">' + social + '</div></div>'
        + '</div>'
        + '<div class="footer-copy">© 2026 ' + esc(m.title) + ' · 版權所有，翻印必究</div>';
    }

    initThemeToggle();
  }

  function initThemeToggle() {
    var btn = document.getElementById('theme-toggle');
    if (!btn) return;
    function cur() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
    function paint() { btn.textContent = cur() === 'dark' ? '☀' : '☾'; }
    paint();
    btn.addEventListener('click', function () {
      var next = cur() === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('chou-theme', next); } catch (e) {}
      paint();
    });
  }

  /* ══════════════════════════════════════════════════════════
     首頁
  ══════════════════════════════════════════════════════════ */

  function initHome() {
    if (document.body.dataset.page !== 'home') return;
    var all = byDateDesc(allItems());
    if (!all.length) return;

    // 分類卡（依設定自動產生）
    var catGrid = document.getElementById('cat-grid');
    if (catGrid) {
      catGrid.innerHTML = cats().map(function (c) {
        var count = dataOf(c.key).length;
        var cta = c.comingSoon && !count ? '待建置' : '進入 →';
        return '<a href="' + catHref(c) + '" class="cat-card" style="border-left:4px solid ' + c.accent + ';' + (c.comingSoon && !count ? 'opacity:.85;' : '') + '">'
          + '<div class="cat-card-title">' + esc(c.label) + '</div>'
          + '<div class="cat-card-desc">' + esc(c.desc) + '</div>'
          + '<div class="cat-card-cta" style="color:' + (c.comingSoon && !count ? 'var(--faint)' : c.accent) + ';">' + cta + (count ? ' <span class="cat-card-count">' + count + ' 篇</span>' : '') + '</div>'
          + '</a>';
      }).join('');
    }

    // 精選（置頂）：SITE_PINNED 有填就用，否則用最新一篇
    var pinnedIds = window.SITE_PINNED || [];
    var pinned = pinnedIds.map(findItem).filter(Boolean);
    var hero = pinned[0] || all[0];

    var featEl = document.getElementById('featured-area');
    if (featEl && hero) {
      var c = catOf(hero.category) || {};
      var cover = hero.image
        ? '<div class="featured-img" style="background-image:url(\'' + esc(hero.image) + '\')"></div>'
        : '<div class="featured-img featured-img-placeholder"></div>';
      featEl.innerHTML = '<a href="article.html?id=' + encodeURIComponent(hero.id) + '" class="featured-grid">'
        + cover
        + '<div class="featured-body">'
        + '<div class="featured-meta"><span class="featured-badge" style="background:' + (c.accent || '#2A9D8F') + ';">' + esc(c.short || '精選') + '</span><span class="featured-date">' + esc(fmtDot(hero.date)) + '</span><span class="featured-read">' + readingTime(hero) + ' 分鐘閱讀</span></div>'
        + '<div class="featured-title">' + esc(hero.title) + '</div>'
        + '<div class="featured-excerpt">' + esc(clip(hero.summary, 130)) + '</div>'
        + '<span class="featured-link">閱讀全文 →</span>'
        + '</div></a>';
    }

    // 置頂列（pinned 第 2 筆起）
    var pinnedWrap = document.getElementById('pinned-area');
    var pinnedRest = pinned.slice(1);
    if (pinnedWrap) {
      if (pinnedRest.length) {
        pinnedWrap.style.display = '';
        pinnedWrap.innerHTML = '<div class="section-eyebrow">Pinned · 置頂</div><div class="cards-grid">'
          + pinnedRest.slice(0, 3).map(function (i) { return buildCard(i, { showCat: true }); }).join('') + '</div>';
      } else {
        pinnedWrap.style.display = 'none';
      }
    }

    // 最新（跨分類，扣掉 hero）
    var latestEl = document.getElementById('home-latest');
    if (latestEl) {
      var used = {};
      used[hero.id] = 1;
      var latest = all.filter(function (i) { return !used[i.id]; }).slice(0, 6);
      latestEl.innerHTML = latest.map(function (i) { return buildCard(i, { showCat: true }); }).join('');
    }

    // 各分類最新一排
    var perCat = document.getElementById('per-cat-area');
    if (perCat) {
      perCat.innerHTML = cats().map(function (c) {
        var items = byDateDesc(dataOf(c.key)).slice(0, 3);
        if (!items.length) return '';
        return '<div class="cat-row">'
          + '<div class="cat-row-head"><span class="cat-row-dot" style="background:' + c.accent + ';"></span><a href="' + catHref(c) + '" class="cat-row-title">' + esc(c.label) + '</a><a href="' + catHref(c) + '" class="cat-row-more">看全部 →</a></div>'
          + '<div class="cards-grid">' + items.map(function (i) { return buildCard(i); }).join('') + '</div>'
          + '</div>';
      }).join('');
    }
  }

  /* ══════════════════════════════════════════════════════════
     分類列表頁（news / titanium / other / category.html?cat=）
  ══════════════════════════════════════════════════════════ */

  function initCategory() {
    if (document.body.dataset.page !== 'category') return;
    var key = document.body.dataset.cat || qs('cat');
    var c = catOf(key);
    var headerSlot = document.getElementById('page-header-slot');

    if (!c) {
      if (headerSlot) headerSlot.innerHTML = pageHeader({ headerBg: '#264653', eyebrow: 'NOT FOUND', label: '找不到分類', desc: '請從首頁選擇分類。', accent: '#2A9D8F' });
      return;
    }
    document.title = c.label + " — " + meta().title;
    if (headerSlot) headerSlot.innerHTML = pageHeader(c);

    var data = byDateDesc(dataOf(key));
    var filtersWrap = document.getElementById('filters-wrap');
    var grid = document.getElementById('cat-grid');
    var countEl = document.getElementById('cat-count');

    // 無資料 → 即將上線
    if (!data.length) {
      if (filtersWrap) filtersWrap.style.display = 'none';
      var bar = document.querySelector('.filter-count-bar');
      if (bar) bar.style.display = 'none';
      if (grid) {
        grid.className = '';
        grid.innerHTML = '<div class="coming-soon-wrap">'
          + '<div class="coming-soon-banner"><span class="coming-soon-eyebrow">COMING SOON</span></div>'
          + '<div class="coming-soon-badge" style="color:' + c.accent + ';background:' + hexA(c.accent, .18) + ';">待建置</div>'
          + '<div class="coming-soon-title">這個分類即將上線</div>'
          + '<p class="coming-soon-desc">' + esc(c.label) + ' 的分享內容正在整理中，後續會由 Notion 自動同步補上，敬請期待。</p>'
          + '<a href="index.html" class="coming-soon-link">← 回首頁看看其他分類</a>'
          + '</div>';
      }
      return;
    }

    var regionSet = [], tagSet = [];
    data.forEach(function (a) {
      if (a.region && regionSet.indexOf(a.region) === -1) regionSet.push(a.region);
      (a.tags || []).forEach(function (t) { if (tagSet.indexOf(t) === -1) tagSet.push(t); });
    });
    regionSet.sort(); tagSet.sort();

    // 複選 + 可摺疊。regions / tags 為已選清單（空 = 全部）。
    var state = { regions: [], tags: [], sort: '最新', open: { region: false, tag: false } };

    function summaryText(sel) {
      if (!sel.length) return '全部';
      if (sel.length <= 2) return sel.join('、');
      return sel.slice(0, 2).join('、') + ' +' + (sel.length - 2);
    }

    function buildBlock(key, label, values) {
      var sel = state[key + 's'];
      var open = state.open[key];
      var chips = '<button class="fchip' + (sel.length ? '' : ' active') + '" data-all="1">全部</button>'
        + values.map(function (v) {
            var on = sel.indexOf(v) !== -1;
            return '<button class="fchip' + (on ? ' active' : '') + '" data-v="' + esc(v) + '">' + (on ? '✓ ' : '') + esc(v) + '</button>';
          }).join('');
      return '<div class="filter-block' + (open ? ' open' : '') + '" data-key="' + key + '">'
        + '<button class="filter-toggle" type="button" data-toggle="' + key + '">'
        + '<span class="filter-toggle-label">' + label + '</span>'
        + '<span class="filter-toggle-summary">' + esc(summaryText(sel)) + '</span>'
        + (sel.length ? '<span class="filter-toggle-badge">' + sel.length + '</span>' : '')
        + '<span class="filter-toggle-caret">▾</span>'
        + '</button>'
        + '<div class="filter-panel"' + (open ? '' : ' hidden') + '><div class="filter-panel-chips">' + chips + '</div></div>'
        + '</div>';
    }

    function renderFilters() {
      filtersWrap.innerHTML =
        buildBlock('region', '地區', regionSet)
        + buildBlock('tag', '標籤', tagSet)
        + '<div class="filter-row filter-row-sort"><span class="filter-label">排序</span><div class="filter-chips" id="filter-sort"></div></div>';

      var sortEl = document.getElementById('filter-sort');
      ['最新', '最舊'].forEach(function (v) {
        var b = document.createElement('button');
        b.className = 'filter-chip' + (state.sort === v ? ' active' : '');
        b.textContent = v;
        b.addEventListener('click', function () { state.sort = v; render(); });
        sortEl.appendChild(b);
      });

      filtersWrap.querySelectorAll('[data-toggle]').forEach(function (t) {
        t.addEventListener('click', function () {
          var k = t.getAttribute('data-toggle');
          state.open[k] = !state.open[k];
          render();
        });
      });
      filtersWrap.querySelectorAll('.filter-block').forEach(function (block) {
        var key = block.getAttribute('data-key');
        block.querySelectorAll('.fchip').forEach(function (chip) {
          chip.addEventListener('click', function () {
            var arr = state[key + 's'];
            if (chip.getAttribute('data-all')) { state[key + 's'] = []; render(); return; }
            var v = chip.getAttribute('data-v');
            var i = arr.indexOf(v);
            if (i === -1) arr.push(v); else arr.splice(i, 1);
            render();
          });
        });
      });
    }

    function matchTags(a) {
      var ts = a.tags || [];
      for (var i = 0; i < state.tags.length; i++) { if (ts.indexOf(state.tags[i]) !== -1) return true; }
      return false;
    }

    function render() {
      renderFilters();
      var filtered = data;
      if (state.regions.length) filtered = filtered.filter(function (a) { return state.regions.indexOf(a.region) !== -1; });
      if (state.tags.length) filtered = filtered.filter(matchTags);
      if (state.sort === '最舊') filtered = filtered.slice().reverse();

      grid.innerHTML = filtered.length
        ? filtered.map(function (a) { return buildCard(a); }).join('')
        : '<div class="no-results">沒有符合條件的項目。</div>';
      if (countEl) countEl.textContent = filtered.length + ' 篇文章';
    }
    render();
  }

  function pageHeader(c) {
    return '<div class="page-header" style="background:' + (c.headerBg || '#264653') + ';">'
      + '<div class="page-header-inner">'
      + '<div class="page-header-eyebrow" style="color:' + (c.accent || '#E9C46A') + ';">' + esc(c.eyebrow || '') + '</div>'
      + '<h1>' + esc(c.label) + '</h1>'
      + '<p>' + esc(c.desc || '') + '</p>'
      + '</div></div>';
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  /* ══════════════════════════════════════════════════════════
     文章頁（目錄 / 閱讀時間 / 上一篇下一篇 / 相關文章）
  ══════════════════════════════════════════════════════════ */

  function initArticle() {
    var container = document.getElementById('article-content');
    if (!container) return;

    var id = qs('id');
    var item = findItem(id);
    var coverEl = document.getElementById('article-cover');

    if (!item) {
      container.innerHTML = '<p class="article-missing">找不到這篇文章。</p><a class="article-back" href="index.html">← 回首頁</a>';
      return;
    }

    var c = catOf(item.category) || {};
    document.title = item.title + " — " + meta().title;

    if (coverEl) {
      if (item.image) { coverEl.style.backgroundImage = 'url("' + esc(item.image) + '")'; coverEl.style.display = 'block'; }
      else { coverEl.style.display = 'none'; }
    }

    var parsed = parseArticle(item);
    var bodyHtml = parsed.blocks.map(function (b) {
      if (b.type === 'h') return '<h2 class="article-h2" id="' + b.id + '">' + esc(b.text) + '</h2>';
      if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') return '<li class="article-li">' + esc(b.text) + '</li>';
      if (b.type === 'quote') return '<blockquote class="article-quote">' + esc(b.text) + '</blockquote>';
      return '<p class="article-p">' + esc(b.text) + '</p>';
    }).join('');
    if (!bodyHtml) bodyHtml = '<p class="article-p">本則暫無內文，請點擊下方連結閱讀原文。</p>';

    var tagsHtml = [item.region].filter(Boolean).map(function (t) {
      return '<a class="article-tag" href="archive.html?region=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
    }).concat((item.tags || []).map(function (t) {
      return '<a class="article-tag" href="tag.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>';
    })).join('');

    // 目錄（≥3 個標題才顯示）
    var tocHtml = '';
    if (parsed.toc.length >= 3) {
      tocHtml = '<aside class="article-toc"><div class="article-toc-title">目錄</div><ol>'
        + parsed.toc.map(function (t) { return '<li><a href="#' + t.id + '">' + esc(clip(t.text, 30)) + '</a></li>'; }).join('')
        + '</ol></aside>';
    }

    container.innerHTML =
      '<a class="article-back" href="' + catHref(c) + '">← ' + esc(c.label || '返回') + '</a>'
      + '<div class="article-tags">' + tagsHtml + '</div>'
      + '<h1 class="article-title">' + esc(item.title) + '</h1>'
      + '<div class="article-byline"><span>' + esc(fmtDate(item.date)) + '</span><span class="article-dot">·</span><span>' + readingTime(item) + ' 分鐘閱讀</span>'
      + (c.short ? '<span class="article-dot">·</span><a class="article-byline-cat" style="color:' + c.accent + ';" href="' + catHref(c) + '">' + esc(c.label) + '</a>' : '') + '</div>'
      + '<div class="article-layout">'
      + '<div class="article-body">' + bodyHtml + '</div>'
      + tocHtml
      + '</div>'
      + '<div class="article-source"><a href="' + esc(item.sourceUrl || '#') + '" target="_blank" rel="noopener">閱讀原文 →</a>'
      + '<button class="article-share" id="article-share" type="button">分享連結</button></div>'
      + prevNextHtml(item)
      + relatedHtml(item);

    var shareBtn = document.getElementById('article-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      var url = window.location.href;
      if (navigator.share) { navigator.share({ title: item.title, url: url }).catch(function () {}); }
      else if (navigator.clipboard) { navigator.clipboard.writeText(url); shareBtn.textContent = '已複製連結 ✓'; setTimeout(function () { shareBtn.textContent = '分享連結'; }, 1800); }
    });
  }

  function prevNextHtml(item) {
    var list = byDateDesc(dataOf(item.category));
    var idx = -1;
    for (var i = 0; i < list.length; i++) if (list[i].id === item.id) { idx = i; break; }
    if (idx === -1) return '';
    var newer = list[idx - 1]; // 較新
    var older = list[idx + 1]; // 較舊
    function box(it, label, dir) {
      if (!it) return '<span class="pn-box pn-empty"></span>';
      return '<a class="pn-box pn-' + dir + '" href="article.html?id=' + encodeURIComponent(it.id) + '">'
        + '<span class="pn-label">' + label + '</span>'
        + '<span class="pn-title">' + esc(clip(it.title, 42)) + '</span></a>';
    }
    return '<nav class="article-prevnext">' + box(newer, '← 上一篇（較新）', 'prev') + box(older, '下一篇（較舊）→', 'next') + '</nav>';
  }

  function relatedHtml(item) {
    var pool = dataOf(item.category).filter(function (a) { return a.id !== item.id; });
    var tags = item.tags || [];
    pool.forEach(function (a) {
      var shared = (a.tags || []).filter(function (t) { return tags.indexOf(t) !== -1; }).length;
      a._score = shared;
    });
    var scored = pool.filter(function (a) { return a._score > 0; }).sort(function (a, b) {
      return b._score - a._score || (a.date < b.date ? 1 : -1);
    });
    var related = scored.slice(0, 3);
    if (related.length < 3) {
      byDateDesc(pool).forEach(function (a) {
        if (related.length < 3 && related.indexOf(a) === -1) related.push(a);
      });
    }
    if (!related.length) return '';
    return '<div class="article-related"><div class="section-eyebrow">Related · 相關文章</div><div class="cards-grid">'
      + related.map(function (a) { return buildCard(a); }).join('') + '</div></div>';
  }

  /* ══════════════════════════════════════════════════════════
     搜尋（多關鍵字 AND + 高亮 + 分類過濾）
  ══════════════════════════════════════════════════════════ */

  function initSearch() {
    var grid = document.getElementById('search-grid');
    if (!grid) return;
    var q = (qs('q') || '').trim();
    var terms = q.split(/\s+/).filter(Boolean);
    var headingEl = document.getElementById('search-heading');
    var countEl = document.getElementById('search-count');
    var filterEl = document.getElementById('search-cat-filter');

    if (headingEl) headingEl.textContent = q ? '搜尋「' + q + '」' : '搜尋';

    var sorted = byDateDesc(allItems());
    var matched = terms.length ? sorted.filter(function (a) {
      var hay = ((a.title || '') + ' ' + (a.summary || '') + ' ' + (a.region || '') + ' ' + (a.tags || []).join(' ')).toLowerCase();
      return terms.every(function (t) { return hay.indexOf(t.toLowerCase()) !== -1; });
    }) : [];

    // 相關度：標題命中加權
    matched.forEach(function (a) {
      var title = (a.title || '').toLowerCase();
      a._rel = terms.reduce(function (s, t) { return s + (title.indexOf(t.toLowerCase()) !== -1 ? 3 : 0); }, 0);
    });
    matched.sort(function (a, b) { return b._rel - a._rel || (a.date < b.date ? 1 : -1); });

    var state = { cat: '全部' };

    function render() {
      // 分類過濾鈕
      if (filterEl) {
        var counts = {};
        matched.forEach(function (a) { counts[a.category] = (counts[a.category] || 0) + 1; });
        filterEl.innerHTML = '';
        var opts = [{ key: '全部', label: '全部', n: matched.length }].concat(cats().filter(function (c) { return counts[c.key]; }).map(function (c) { return { key: c.key, label: c.short, n: counts[c.key] }; }));
        if (opts.length <= 2) { filterEl.style.display = 'none'; }
        else {
          filterEl.style.display = '';
          opts.forEach(function (o) {
            var btn = document.createElement('button');
            btn.className = 'filter-chip' + (state.cat === o.key ? ' active' : '');
            btn.textContent = o.label + ' (' + o.n + ')';
            btn.addEventListener('click', function () { state.cat = o.key; render(); });
            filterEl.appendChild(btn);
          });
        }
      }
      var shown = state.cat === '全部' ? matched : matched.filter(function (a) { return a.category === state.cat; });
      grid.innerHTML = shown.length
        ? shown.map(function (a) { return buildCard(a, { showCat: true, highlight: terms }); }).join('')
        : (q ? '<div class="no-results">找不到符合「' + esc(q) + '」的文章。<br><span class="no-results-sub">試試更少的關鍵字，或瀏覽下方熱門標籤。</span>' + popularTags() + '</div>'
             : '<div class="no-results">請輸入搜尋關鍵字。' + popularTags() + '</div>');
      if (countEl) countEl.textContent = q ? (shown.length + ' 篇符合的文章') : '';
    }
    render();
  }

  function popularTags() {
    var counts = {};
    allItems().forEach(function (a) { (a.tags || []).forEach(function (t) { counts[t] = (counts[t] || 0) + 1; }); });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 12);
    if (!top.length) return '';
    return '<div class="popular-tags">' + top.map(function (t) { return '<a class="tag-pill" href="tag.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'; }).join('') + '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     標籤頁
  ══════════════════════════════════════════════════════════ */

  function initTag() {
    if (document.body.dataset.page !== 'tag') return;
    var tag = (qs('tag') || '').trim();
    var headerSlot = document.getElementById('page-header-slot');
    var grid = document.getElementById('tag-grid');
    var countEl = document.getElementById('tag-count');

    if (headerSlot) headerSlot.innerHTML = pageHeader({ headerBg: '#264653', eyebrow: 'TAG · 標籤', label: tag ? '#' + tag : '標籤', desc: '所有標記「' + tag + '」的文章，跨分類彙整。', accent: '#E9C46A' });
    document.title = (tag ? '#' + tag : '標籤') + ' — ' + meta().title;

    var items = byDateDesc(allItems().filter(function (a) { return (a.tags || []).indexOf(tag) !== -1; }));
    if (countEl) countEl.textContent = items.length + ' 篇文章';
    if (grid) grid.innerHTML = items.length
      ? items.map(function (a) { return buildCard(a, { showCat: true }); }).join('')
      : '<div class="no-results">沒有標記「' + esc(tag) + '」的文章。</div>';

    // 相關標籤
    var rel = document.getElementById('tag-related');
    if (rel) {
      var counts = {};
      items.forEach(function (a) { (a.tags || []).forEach(function (t) { if (t !== tag) counts[t] = (counts[t] || 0) + 1; }); });
      var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 14);
      rel.innerHTML = top.length ? '<span class="tag-related-label">相關標籤</span>' + top.map(function (t) { return '<a class="tag-pill" href="tag.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '</a>'; }).join('') : '';
    }
  }

  /* ══════════════════════════════════════════════════════════
     歸檔頁（月份 / 地區 / 標籤）
  ══════════════════════════════════════════════════════════ */

  function initArchive() {
    if (document.body.dataset.page !== 'archive') return;
    var month = qs('month'), region = qs('region');
    var headerSlot = document.getElementById('page-header-slot');
    var body = document.getElementById('archive-body');
    var all = byDateDesc(allItems());

    // 篩選模式：顯示卡片
    if (month || region) {
      var label = month ? month.replace('-', ' 年 ') + ' 月' : region;
      var eyebrow = month ? 'ARCHIVE · 月份' : 'ARCHIVE · 地區';
      if (headerSlot) headerSlot.innerHTML = pageHeader({ headerBg: '#264653', eyebrow: eyebrow, label: label, desc: '依' + (month ? '月份' : '地區') + '彙整的文章。', accent: '#2A9D8F' });
      document.title = label + ' — ' + meta().title;
      var items = all.filter(function (a) {
        if (month) return (a.date || '').slice(0, 7) === month;
        return a.region === region;
      });
      if (body) body.innerHTML = '<div class="filter-count-bar"><span class="filter-count">' + items.length + ' 篇文章</span><a class="archive-allback" href="archive.html">← 回歸檔總覽</a></div>'
        + '<div class="section-sm"><div class="cards-grid">' + items.map(function (a) { return buildCard(a, { showCat: true }); }).join('') + '</div></div>';
      return;
    }

    // 總覽模式：月份 / 地區 / 標籤
    if (headerSlot) headerSlot.innerHTML = pageHeader({ headerBg: '#264653', eyebrow: 'ARCHIVE · 歸檔', label: '歸檔總覽', desc: '依月份、地區、標籤瀏覽全站 ' + all.length + ' 篇文章。', accent: '#2A9D8F' });
    document.title = '歸檔總覽 — ' + meta().title;

    var months = {}, regions = {}, tags = {};
    all.forEach(function (a) {
      var ym = (a.date || '').slice(0, 7);
      if (ym) months[ym] = (months[ym] || 0) + 1;
      if (a.region) regions[a.region] = (regions[a.region] || 0) + 1;
      (a.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; });
    });

    var monthList = Object.keys(months).sort().reverse().map(function (m) {
      return '<a class="archive-row" href="archive.html?month=' + encodeURIComponent(m) + '"><span>' + m.replace('-', ' / ') + '</span><span class="archive-n">' + months[m] + '</span></a>';
    }).join('');

    var regionList = Object.keys(regions).sort(function (a, b) { return regions[b] - regions[a]; }).map(function (r) {
      return '<a class="archive-pill" href="archive.html?region=' + encodeURIComponent(r) + '">' + esc(r) + '<span class="archive-pill-n">' + regions[r] + '</span></a>';
    }).join('');

    var tagList = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; }).map(function (t) {
      var sz = Math.min(4, Math.ceil(tags[t] / 3));
      return '<a class="archive-tag s' + sz + '" href="tag.html?tag=' + encodeURIComponent(t) + '">' + esc(t) + '<span class="archive-pill-n">' + tags[t] + '</span></a>';
    }).join('');

    if (body) body.innerHTML =
      '<div class="archive-grid">'
      + '<section class="archive-col"><div class="section-eyebrow">By Month · 月份</div><div class="archive-months">' + monthList + '</div></section>'
      + '<section class="archive-col"><div class="section-eyebrow">By Region · 地區</div><div class="archive-pills">' + regionList + '</div></section>'
      + '</div>'
      + '<section class="archive-tags-sec"><div class="section-eyebrow">By Tag · 標籤</div><div class="archive-tags">' + tagList + '</div></section>';
  }

  /* ══════════════════════════════════════════════════════════
     聯絡頁
  ══════════════════════════════════════════════════════════ */

  function initContact() {
    if (document.body.dataset.page !== 'contact') return;
    var m = meta();
    var headerSlot = document.getElementById('page-header-slot');
    var contactArea = document.getElementById('contact-area');

    if (headerSlot) headerSlot.innerHTML = pageHeader({
      headerBg: '#264653',
      eyebrow: 'CONTACT · 聯絡我',
      label: '與我聯絡',
      desc: '對新聞內容有疑問、想提供產業線索，或希望交流合作，都歡迎留言。我會盡快回覆。',
      accent: '#2A9D8F'
    });
    document.title = '與我聯絡 — ' + m.title;

    if (!contactArea) return;
    var emails = m.emails || [];
    var primaryEmail = emails[0] || '';
    var socialLinks = (m.social || []).map(function (s) {
      return '<a class="contact-social-link" href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + '</a>';
    }).join('');
    var emailRows = emails.map(function (email, idx) {
      return '<a class="contact-email-row" href="mailto:' + esc(email) + '">'
        + '<span class="contact-email-icon">✉</span>'
        + '<span><span class="contact-email-label">' + (idx === 0 ? '個人信箱' : '工作信箱') + '</span>'
        + '<span class="contact-email-address">' + esc(email) + '</span></span>'
        + '</a>';
    }).join('');

    contactArea.innerHTML =
      '<section class="contact-grid">'
      + '<aside class="contact-intro">'
      + '<div class="section-eyebrow">Direct · 其他聯絡方式</div>'
      + '<p>這是一個工作之餘的小小實驗，將金屬產業資訊一點一滴積累、分享。任何想法都歡迎交流。</p>'
      + '<div class="contact-email-list">' + emailRows + '</div>'
      + '<div class="contact-social">' + socialLinks + '</div>'
      + '</aside>'
      + '<form class="contact-form" action="' + (primaryEmail ? 'mailto:' + esc(primaryEmail) : '#') + '" method="post" enctype="text/plain">'
      + '<label>姓名 <span>*</span><input name="姓名" type="text" placeholder="您的姓名" required></label>'
      + '<label>單位 / 公司 <em>（選填）</em><input name="單位 / 公司" type="text" placeholder="您的服務單位或公司"></label>'
      + '<label>電子信箱 <span>*</span><input name="電子信箱" type="email" placeholder="您的 Email 電子信箱" required></label>'
      + '<fieldset><legend>聯絡原因 <span>*</span></legend>'
      + '<label class="contact-radio"><input name="聯絡原因" type="radio" value="對新聞內容的疑問或回饋" required><span>對新聞內容的疑問或回饋</span></label>'
      + '<label class="contact-radio"><input name="聯絡原因" type="radio" value="提供產業新聞線索 / 投稿"><span>提供產業新聞線索 / 投稿</span></label>'
      + '<label class="contact-radio"><input name="聯絡原因" type="radio" value="交流、合作或演講邀約"><span>交流、合作或演講邀約</span></label>'
      + '<label class="contact-radio"><input name="聯絡原因" type="radio" value="其他"><span>其他</span></label>'
      + '</fieldset>'
      + '<label>您的訊息 <span>*</span><textarea name="訊息" placeholder="請填寫您的訊息細節" required></textarea></label>'
      + '<div class="contact-form-foot"><button type="submit">送出訊息 →</button><span>送出將以你的郵件程式寄出</span></div>'
      + '</form>'
      + '</section>';
  }

  /* ══════════════════════════════════════════════════════════
     啟動：先動態載入各分類資料，再渲染
  ══════════════════════════════════════════════════════════ */

  function loadData() {
    return Promise.all(cats().map(function (c) {
      if (window[c.dataVar]) return Promise.resolve();
      if (c.comingSoon) return Promise.resolve(); // 尚無資料檔，略過避免 404
      return new Promise(function (res) {
        var s = document.createElement('script');
        s.src = c.dataFile;
        s.onload = res; s.onerror = res;
        document.head.appendChild(s);
      });
    }));
  }

  function boot() {
    renderChrome();
    initHome();
    initCategory();
    initArticle();
    initSearch();
    initTag();
    initArchive();
    initContact();
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadData().then(boot);
  });

}());
