(() => {
  // State
  let allEtfs = [];
  let filteredEtfs = [];
  let currentAssetTab = 'ALL';      // ALL | CORE | SAFE | RISK | SAVED
  let currentManager = 'ALL';       // ALL | RISE | TIGER | KODEX | ACE | SOL | PLUS | HANARO | KOSEF | TIMEFOLIO
  let currentCategory = 'ALL';
  let currentTimeframe = 'day';     // day | week | month
  let currentChartStyle = 'candle'; // candle | area
  let currentGridCols = 4;          // 3 | 4 | 6
  let currentSort = 'kbCore';
  let searchQuery = '';
  let showAllCards = false;
  const INITIAL_VISIBLE_LIMIT = 60;

  // Compare / Portfolio Basket (persisted in localStorage)
  const STORAGE_KEY = 'kb_pension_compare_etfs_v1';
  let savedCodes = [];
  let customWeights = {}; // code -> weight %

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        savedCodes = parsed;
      }
    }
  } catch (e) {}

  // Default sample basket (위험자산 2종 + 안전자산 1종 = 70:30 맞춤 예시)
  if (savedCodes.length === 0) {
    savedCodes = ['379780', '480020', '461950'];
    customWeights = { '379780': 40, '480020': 30, '461950': 30 };
  }

  function saveBasket() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedCodes));
    } catch (e) {}
    updateSavedCounts();
  }

  // Modal state
  let activeModalCode = null;
  let activeModalTf = 'day';
  let activeModalData = null;
  let modalHoverIndex = -1;

  // DOM Elements
  const elGrid = document.getElementById('etfChartGrid');
  const elSearchInput = document.getElementById('etfSearchInput');
  const elBtnClearSearch = document.getElementById('btnClearSearch');
  const elAssetTabs = document.getElementById('assetTabs');
  const elManagerRow = document.getElementById('managerChipRow');
  const elCategoryRow = document.getElementById('categoryChipRow');
  const elTimeframeGroup = document.getElementById('timeframeGroup');
  const elChartStyleGroup = document.getElementById('chartStyleGroup');
  const elGridColsGroup = document.getElementById('gridColsGroup');
  const elSortSelect = document.getElementById('sortSelect');
  const elLoadMoreWrap = document.getElementById('loadMoreWrap');
  const elBtnShowAll = document.getElementById('btnShowAllEtfs');

  // Formatters
  function fmtNum(n) {
    if (n == null || isNaN(n)) return '-';
    return Number(n).toLocaleString('ko-KR');
  }

  function fmtPct(n, digits = 2) {
    if (n == null || isNaN(n)) return '0.00%';
    const v = Number(n);
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(digits)}%`;
  }

  function colorClass(n) {
    const v = Number(n || 0);
    if (v > 0) return 'up-text';
    if (v < 0) return 'dn-text';
    return 'flat-text';
  }

  function badgeChgClass(n) {
    const v = Number(n || 0);
    if (v > 0) return 'up';
    if (v < 0) return 'dn';
    return 'flat';
  }

  // Client-side indicator calculator (for serverless Firebase Hosting / GitHub Pages)
  function computeClientCandleIndicators(candles) {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);

    const enriched = candles.map((c, idx) => {
      const s5 = closes.slice(Math.max(0, idx - 4), idx + 1);
      const s20 = closes.slice(Math.max(0, idx - 19), idx + 1);
      const s60 = closes.slice(Math.max(0, idx - 59), idx + 1);
      return {
        ...c,
        ma5: Math.round(s5.reduce((a, b) => a + b, 0) / s5.length),
        ma20: Math.round(s20.reduce((a, b) => a + b, 0) / s20.length),
        ma60: Math.round(s60.reduce((a, b) => a + b, 0) / s60.length)
      };
    });

    const high20 = Math.max(...highs.slice(-20));
    const low20 = Math.min(...lows.slice(-20));

    let trSum = 0;
    let trCount = 0;
    for (let i = Math.max(1, closes.length - 14); i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trSum += tr;
      trCount++;
    }
    const atr14 = trCount > 0 ? Math.round(trSum / trCount) : Math.round((closes[closes.length - 1] || 10000) * 0.015);

    let gains = 0;
    let losses = 0;
    for (let i = Math.max(1, closes.length - 14); i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }
    const rs = losses === 0 ? 100 : gains / losses;
    const rsi14 = losses === 0 ? 70 : Number((100 - 100 / (1 + rs)).toFixed(1));

    return {
      candles: enriched,
      high20,
      low20,
      atr14,
      rsi14,
      ma20: enriched[enriched.length - 1]?.ma20 || closes[closes.length - 1],
      ma60: enriched[enriched.length - 1]?.ma60 || closes[closes.length - 1]
    };
  }

  function applyCatalogData(items, source, timeframe) {
    allEtfs = items || [];
    const safeCount = allEtfs.filter(x => x.assetClass === 'SAFE').length;
    const riskCount = allEtfs.filter(x => x.assetClass === 'RISK').length;

    document.getElementById('statTotalCount').textContent = `${allEtfs.length}종`;
    document.getElementById('statSafeCount').textContent = `${safeCount}종`;
    document.getElementById('statRiskCount').textContent = `${riskCount}종`;

    document.getElementById('cntAll').textContent = allEtfs.length;
    document.getElementById('cntCore').textContent = allEtfs.filter(x => x.kbCore).length;
    document.getElementById('cntSafe').textContent = safeCount;
    document.getElementById('cntRisk').textContent = riskCount;

    const syncEl = document.getElementById('syncBadgeText');
    if (syncEl) {
      const tfLabel = timeframe === 'month' ? '월봉' : timeframe === 'week' ? '주봉' : '일봉';
      syncEl.textContent = source === 'live-naver'
        ? `(🟢 네이버 금융 실시간 시세 연동됨 · ${tfLabel} 기준)`
        : `(☁️ 클라우드/모바일 독립 엔진 · ${tfLabel} 차트)`;
    }

    renderFilterChips();
    updateSavedCounts();
    applyFiltersAndRender();
  }

  // Fetch ETF List + Mini Candles (Works 100% Standalone on Firebase/GitHub Pages + Live Server Enrichment)
  async function loadEtfList(timeframe = currentTimeframe) {
    const syncEl = document.getElementById('syncBadgeText');
    if (syncEl) syncEl.textContent = '(차트 데이터 동기화 중...)';

    // 1. Instant client-side load from bundled kb-etf-data.js (for Firebase Hosting & GitHub Pages)
    if (window.KB_ETF_CATALOG && Array.isArray(window.KB_ETF_CATALOG.KB_PENSION_ETFS)) {
      const localItems = window.KB_ETF_CATALOG.KB_PENSION_ETFS.map(etf => ({
        ...etf,
        miniCandles: window.KB_ETF_CATALOG.generateSyntheticCandles(etf, timeframe, 32)
      }));
      applyCatalogData(localItems, 'client-catalog', timeframe);
    }

    // 2. Try optional live server API if running via node server.js
    try {
      const res = await fetch(`/api/kb-etf/list?timeframe=${encodeURIComponent(timeframe)}`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.items) && data.items.length > 0) {
          applyCatalogData(data.items, data.source, timeframe);
        }
      }
    } catch (err) {
      // Running on static hosting (Firebase Hosting / GitHub Pages) - already rendered via client-catalog!
    }
  }

  function updateSavedCounts() {
    const cntSaved = document.getElementById('cntSaved');
    if (cntSaved) cntSaved.textContent = savedCodes.length;
    const statCompare = document.getElementById('statCompareCount');
    if (statCompare) {
      statCompare.textContent = `선택 ${savedCodes.length}종 비교 열기`;
    }
    renderFloatingDock();
  }

  function renderFilterChips() {
    // 1. Managers
    const managersOrder = [
      { key: 'ALL', label: '전체 운용사' },
      { key: 'RISE', label: 'RISE (KB자산운용)' },
      { key: 'TIGER', label: 'TIGER (미래에셋)' },
      { key: 'KODEX', label: 'KODEX (삼성)' },
      { key: 'ACE', label: 'ACE (한국투자)' },
      { key: 'SOL', label: 'SOL (신한)' },
      { key: 'PLUS', label: 'PLUS (한화)' },
      { key: 'HANARO', label: 'HANARO (NH)' },
      { key: 'KOSEF', label: 'KOSEF (키움)' },
      { key: 'TIMEFOLIO', label: 'TIMEFOLIO' }
    ];

    const mgrCounts = {};
    for (const item of allEtfs) {
      mgrCounts[item.manager] = (mgrCounts[item.manager] || 0) + 1;
    }

    elManagerRow.innerHTML = `<span class="chip-row-label">운용사별</span>` + managersOrder.map(m => {
      const cnt = m.key === 'ALL' ? allEtfs.length : (mgrCounts[m.key] || 0);
      const active = currentManager === m.key ? 'active' : '';
      return `<button type="button" class="filter-chip ${active}" data-mgr="${m.key}">${m.label} (${cnt})</button>`;
    }).join('');

    elManagerRow.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        currentManager = btn.dataset.mgr;
        renderFilterChips();
        applyFiltersAndRender();
      });
    });

    // 2. Categories
    const categoriesOrder = [
      'ALL',
      '미국대표지수',
      'AI/반도체/빅테크',
      '배당/커버드콜',
      '채권형(안전자산)',
      '채권혼합(안전자산)',
      '금리/파킹형(안전자산)',
      'TDF/자산배분(안전자산)',
      '글로벌/테마',
      '국내대표지수',
      '국내배당/가치',
      '국내섹터/테마',
      '리츠/인프라'
    ];

    const catCounts = {};
    for (const item of allEtfs) {
      catCounts[item.category] = (catCounts[item.category] || 0) + 1;
    }

    elCategoryRow.innerHTML = `<span class="chip-row-label">카테고리</span>` + categoriesOrder.map(cat => {
      const cnt = cat === 'ALL' ? allEtfs.length : (catCounts[cat] || 0);
      if (cat !== 'ALL' && cnt === 0) return '';
      const label = cat === 'ALL' ? '전체 테마' : cat;
      const active = currentCategory === cat ? 'active' : '';
      return `<button type="button" class="filter-chip ${active}" data-cat="${cat}">${label} (${cnt})</button>`;
    }).join('');

    elCategoryRow.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        currentCategory = btn.dataset.cat;
        renderFilterChips();
        applyFiltersAndRender();
      });
    });
  }

  function applyFiltersAndRender() {
    const q = searchQuery.trim().toUpperCase();

    filteredEtfs = allEtfs.filter(item => {
      if (currentAssetTab === 'CORE' && !item.kbCore) return false;
      if (currentAssetTab === 'SAFE' && item.assetClass !== 'SAFE') return false;
      if (currentAssetTab === 'RISK' && item.assetClass !== 'RISK') return false;
      if (currentAssetTab === 'SAVED' && !savedCodes.includes(item.code)) return false;

      if (currentManager !== 'ALL' && item.manager !== currentManager) return false;
      if (currentCategory !== 'ALL' && item.category !== currentCategory) return false;

      if (q) {
        const hay = `${item.name} ${item.code} ${item.manager} ${item.category} ${item.desc || ''}`.toUpperCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    // Sort
    filteredEtfs.sort((a, b) => {
      if (currentSort === 'kbCore') {
        if (a.kbCore !== b.kbCore) return a.kbCore ? -1 : 1;
        return (b.ret3M || 0) - (a.ret3M || 0);
      }
      if (currentSort === 'ret3M') return (b.ret3M || 0) - (a.ret3M || 0);
      if (currentSort === 'ret1Y') return (b.ret1Y || 0) - (a.ret1Y || 0);
      if (currentSort === 'ret1M') return (b.ret1M || 0) - (a.ret1M || 0);
      if (currentSort === 'changePct') return (b.changePct || 0) - (a.changePct || 0);
      if (currentSort === 'divYield') return (b.divYield || 0) - (a.divYield || 0);
      if (currentSort === 'feeAsc') return (a.fee ?? 99) - (b.fee ?? 99);
      return 0;
    });

    document.getElementById('filteredCountText').textContent = filteredEtfs.length;

    const visibleList = showAllCards ? filteredEtfs : filteredEtfs.slice(0, INITIAL_VISIBLE_LIMIT);
    if (!showAllCards && filteredEtfs.length > INITIAL_VISIBLE_LIMIT) {
      elLoadMoreWrap.style.display = 'block';
      elBtnShowAll.textContent = `나머지 ${filteredEtfs.length - INITIAL_VISIBLE_LIMIT}개 ETF 차트 모두 펼치기 (총 ${filteredEtfs.length}종 한눈에 보기)`;
    } else {
      elLoadMoreWrap.style.display = 'none';
    }

    renderGridCards(visibleList);
  }

  function renderGridCards(list) {
    if (list.length === 0) {
      elGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:60px 20px; background:#111827; border:1px solid #26334d; border-radius:12px;">
          <p style="font-size:17px; font-weight:700; color:#f8fafc;">조건에 해당하는 ETF 종목이 없습니다.</p>
          <p style="font-size:13px; color:#94a3b8; margin-top:6px;">검색어나 필터 조건을 초기화해 보세요.</p>
        </div>
      `;
      return;
    }

    const tfLabel = currentTimeframe === 'month' ? '월봉' : currentTimeframe === 'week' ? '주봉' : '일봉';

    elGrid.innerHTML = list.map(etf => {
      const inCompare = savedCodes.includes(etf.code);
      const assetLabel = etf.assetClass === 'SAFE' ? '안전자산100%' : '위험자산70%';
      return `
        <article class="etf-card ${inCompare ? 'in-compare' : ''}" data-code="${etf.code}">
          <div class="card-top-badges">
            <div class="badge-group-left">
              <span class="mgr-badge mgr-${etf.manager}">${etf.manager}</span>
              <span class="asset-badge ${etf.assetClass}">${assetLabel}</span>
              ${etf.kbCore ? `<span style="font-size:10px; color:#ffbc00; font-weight:800;">★핵심</span>` : ''}
            </div>
            <div class="card-actions">
              <button type="button" class="btn-card-act btn-toggle-compare ${inCompare ? 'active' : ''}" data-code="${etf.code}" title="비교차트 및 70:30 포트폴리오에 담기">
                ${inCompare ? '✓ 비교중' : '+ 비교'}
              </button>
            </div>
          </div>

          <div class="card-title-row">
            <h3 class="etf-name" title="${etf.name}">${etf.name}</h3>
            <span class="etf-code">${etf.code}</span>
          </div>

          <div class="card-price-row">
            <span class="etf-price">${fmtNum(etf.price)}<small style="font-size:11px; font-weight:500; color:#94a3b8; margin-left:2px;">원</small></span>
            <span class="etf-chg ${badgeChgClass(etf.changePct)}">${fmtPct(etf.changePct, 2)}</span>
          </div>

          <div class="mini-chart-wrap">
            <canvas class="mini-chart-canvas" id="canvas-${etf.code}"></canvas>
            <span class="chart-overlay-tag">${etf.category} · ${tfLabel}</span>
          </div>

          <div class="card-metrics-grid">
            <div class="metric-cell">
              <span class="m-lbl">1개월</span>
              <span class="m-val ${colorClass(etf.ret1M)}">${fmtPct(etf.ret1M, 1)}</span>
            </div>
            <div class="metric-cell">
              <span class="m-lbl">3개월</span>
              <span class="m-val ${colorClass(etf.ret3M)}">${fmtPct(etf.ret3M, 1)}</span>
            </div>
            <div class="metric-cell">
              <span class="m-lbl">6개월</span>
              <span class="m-val ${colorClass(etf.ret6M)}">${fmtPct(etf.ret6M, 1)}</span>
            </div>
            <div class="metric-cell">
              <span class="m-lbl">1년</span>
              <span class="m-val ${colorClass(etf.ret1Y)}">${fmtPct(etf.ret1Y, 1)}</span>
            </div>
          </div>

          <div class="card-footer-meta">
            <span>연분배율 <b style="color:#f8fafc;">${(etf.divYield || 0).toFixed(2)}%</b></span>
            <span>총보수 <b style="color:#cbd5e1;">연 ${(etf.fee || 0).toFixed(3)}%</b></span>
          </div>
        </article>
      `;
    }).join('');

    // Attach click events & draw mini canvases
    requestAnimationFrame(() => {
      for (const etf of list) {
        const canvas = document.getElementById(`canvas-${etf.code}`);
        if (canvas && etf.miniCandles) {
          drawMiniChart(canvas, etf.miniCandles, currentChartStyle);
        }
      }
    });

    elGrid.querySelectorAll('.etf-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-toggle-compare')) return;
        const code = card.dataset.code;
        openDetailModal(code);
      });
    });

    elGrid.querySelectorAll('.btn-toggle-compare').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSavedCode(btn.dataset.code);
      });
    });
  }

  // Draw Mini Chart on Card Canvas
  function drawMiniChart(canvas, candles, style = 'candle') {
    if (!candles || candles.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 260;
    const h = rect.height || 116;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padTop = 18;
    const padBot = 14;
    const padLeft = 6;
    const padRight = 6;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBot;

    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
    }
    if (maxP <= minP) maxP = minP + 10;
    const range = maxP - minP;

    const toY = (val) => padTop + plotH - ((val - minP) / range) * plotH;
    const stepX = plotW / candles.length;

    // Subtle horizontal grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
    ctx.lineWidth = 1;
    for (let g = 0.25; g <= 0.75; g += 0.5) {
      const gy = padTop + plotH * g;
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(w - padRight, gy);
      ctx.stroke();
    }

    if (style === 'area') {
      const firstClose = candles[0].close;
      const lastClose = candles[candles.length - 1].close;
      const isUp = lastClose >= firstClose;
      const mainColor = isUp ? '#ef4444' : '#3b82f6';

      const grad = ctx.createLinearGradient(0, padTop, 0, padTop + plotH);
      grad.addColorStop(0, isUp ? 'rgba(239, 68, 68, 0.36)' : 'rgba(59, 130, 246, 0.36)');
      grad.addColorStop(1, 'rgba(9, 13, 22, 0.0)');

      ctx.beginPath();
      candles.forEach((c, i) => {
        const x = padLeft + i * stepX + stepX * 0.5;
        const y = toY(c.close);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.lineTo(padLeft + (candles.length - 1) * stepX + stepX * 0.5, padTop + plotH);
      ctx.lineTo(padLeft + stepX * 0.5, padTop + plotH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
    } else {
      // Candle + MA20
      const barW = Math.max(2, Math.min(8, stepX * 0.66));
      candles.forEach((c, i) => {
        const cx = padLeft + i * stepX + stepX * 0.5;
        const isUp = c.close >= c.open;
        const color = isUp ? '#ef4444' : '#3b82f6';

        // Wick
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx, toY(c.high));
        ctx.lineTo(cx, toY(c.low));
        ctx.stroke();

        // Body
        const yOpen = toY(c.open);
        const yClose = toY(c.close);
        const top = Math.min(yOpen, yClose);
        const bh = Math.max(1.5, Math.abs(yClose - yOpen));
        ctx.fillStyle = color;
        ctx.fillRect(cx - barW / 2, top, barW, bh);
      });

      // Draw 10/20-bar rolling average line in yellow
      ctx.beginPath();
      candles.forEach((c, i) => {
        const slice = candles.slice(Math.max(0, i - 9), i + 1);
        const avg = slice.reduce((acc, x) => acc + x.close, 0) / slice.length;
        const x = padLeft + i * stepX + stepX * 0.5;
        const y = toY(avg);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#ffbc00';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    // High / Low price labels on right
    ctx.font = '600 9.5px sans-serif';
    ctx.fillStyle = 'rgba(248, 113, 113, 0.85)';
    ctx.textAlign = 'right';
    ctx.fillText(`고 ${fmtNum(maxP)}`, w - 6, 12);
    ctx.fillStyle = 'rgba(96, 165, 250, 0.85)';
    ctx.fillText(`저 ${fmtNum(minP)}`, w - 6, h - 3);
  }

  // Toggle ETF in Compare/Portfolio Basket
  function toggleSavedCode(code) {
    const idx = savedCodes.indexOf(code);
    if (idx >= 0) {
      savedCodes.splice(idx, 1);
      delete customWeights[code];
    } else {
      if (savedCodes.length >= 6) {
        alert('수익률 비교 및 포트폴리오 시뮬레이션은 최대 6종목까지 선택할 수 있습니다.');
        return;
      }
      savedCodes.push(code);
    }
    saveBasket();
    applyFiltersAndRender();
    if (activeModalCode === code) {
      updateModalCompareButton(code);
    }
  }

  function renderFloatingDock() {
    const dock = document.getElementById('floatingDock');
    const dockCount = document.getElementById('dockCount');
    const dockItems = document.getElementById('dockItems');
    if (!dock) return;

    if (savedCodes.length === 0) {
      dock.style.display = 'none';
      return;
    }

    dock.style.display = 'flex';
    dockCount.textContent = savedCodes.length;
    dockItems.innerHTML = savedCodes.map(code => {
      const etf = allEtfs.find(x => x.code === code);
      const name = etf ? etf.name : code;
      const badgeColor = etf?.assetClass === 'SAFE' ? '#34d399' : '#fb923c';
      return `
        <span class="dock-chip">
          <b style="color:${badgeColor};">●</b>
          <span>${name}</span>
          <button type="button" data-rm="${code}" title="제외">✕</button>
        </span>
      `;
    }).join('');

    dockItems.querySelectorAll('button[data-rm]').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleSavedCode(btn.dataset.rm);
      });
    });
  }

  // ==================== DETAIL INTERACTIVE CHART MODAL ====================
  async function openDetailModal(code, tf = currentTimeframe) {
    activeModalCode = code;
    activeModalTf = tf;
    modalHoverIndex = -1;

    const modal = document.getElementById('detailModal');
    modal.classList.add('open');

    document.querySelectorAll('#modalTfGroup button').forEach(b => {
      b.classList.toggle('active', b.dataset.tf === tf);
    });

    const count = tf === 'month' ? 60 : 90;
    const foundEtf = allEtfs.find(x => x.code === code) || {
      code,
      name: `ETF (${code})`,
      manager: 'OTHER',
      category: '기타',
      assetClass: 'RISK',
      fee: 0.25,
      divYield: 1.5,
      price: 15000,
      changePct: 0.5,
      ret1M: 2.0,
      ret3M: 6.0,
      ret6M: 12.0,
      ret1Y: 20.0,
      desc: 'KB국민은행 퇴직연금 ETF'
    };

    // 1. Instant client-side 90-bar chart rendering (Works 100% standalone on Firebase / GitHub Pages)
    if (window.KB_ETF_CATALOG && window.KB_ETF_CATALOG.generateSyntheticCandles) {
      const rawCandles = window.KB_ETF_CATALOG.generateSyntheticCandles(foundEtf, tf, count);
      const indicators = computeClientCandleIndicators(rawCandles);
      activeModalData = {
        source: 'client-catalog',
        timeframe: tf,
        etf: foundEtf,
        ...indicators
      };
      renderDetailModalContent(activeModalData);
    }

    // 2. Optional live enrichment if running on local server
    try {
      const res = await fetch(`/api/kb-etf/chart?code=${encodeURIComponent(code)}&timeframe=${encodeURIComponent(tf)}&count=${count}`);
      if (res.ok) {
        const data = await res.json();
        activeModalData = data;
        renderDetailModalContent(data);
      }
    } catch (err) {
      // Static hosting (Firebase / GitHub Pages) - already rendered via client-side engine!
    }
  }

  function updateModalCompareButton(code) {
    const btn = document.getElementById('btnModalToggleCompare');
    if (!btn) return;
    const inSaved = savedCodes.includes(code);
    btn.textContent = inSaved ? '✓ 비교/포트폴리오 담김 (제외하기)' : '+ 비교/포트폴리오에 추가';
  }

  function renderDetailModalContent(data) {
    const { etf, candles, high20, low20, atr14, rsi14, ma20, ma60, source } = data;
    const assetLabel = etf.assetClass === 'SAFE'
      ? '🟢 안전자산 (퇴직연금 100% 편입 가능)'
      : '🟠 위험자산 (퇴직연금 최대 70% 한도)';

    document.getElementById('modalBadges').innerHTML = `
      <span class="mgr-badge mgr-${etf.manager}">${etf.manager}</span>
      <span class="asset-badge ${etf.assetClass}">${assetLabel}</span>
      <span class="mgr-badge mgr-OTHER">${etf.category}</span>
      <span style="font-size:11.5px; color:#94a3b8;">${source === 'live-naver' ? '🟢 네이버 금융 실제 시세' : '⚡ 표준 모델 시세'}</span>
    `;

    document.getElementById('modalEtfTitle').innerHTML = `
      ${etf.name} <span style="font-size:16px; color:#94a3b8; font-weight:600;">(${etf.code})</span>
      <span style="margin-left:12px; color:#fff;">${fmtNum(etf.price)}원</span>
      <span class="etf-chg ${badgeChgClass(etf.changePct)}" style="font-size:15px; margin-left:6px;">${fmtPct(etf.changePct)}</span>
    `;
    document.getElementById('modalEtfDesc').textContent = etf.desc || '';
    document.getElementById('modalCodeTip').textContent = etf.code;

    document.getElementById('linkNaverFinance').href = `https://finance.naver.com/item/main.naver?code=${etf.code}`;
    document.getElementById('linkDaumFinance').href = `https://finance.daum.net/quotes/A${etf.code}`;
    updateModalCompareButton(etf.code);

    document.getElementById('modalStatsGrid').innerHTML = `
      <div class="detail-stat-card">
        <div class="d-lbl">1개월 / 3개월 수익률</div>
        <div class="d-val">
          <span class="${colorClass(etf.ret1M)}">${fmtPct(etf.ret1M, 1)}</span> /
          <span class="${colorClass(etf.ret3M)}">${fmtPct(etf.ret3M, 1)}</span>
        </div>
      </div>
      <div class="detail-stat-card">
        <div class="d-lbl">6개월 / 1년 수익률</div>
        <div class="d-val">
          <span class="${colorClass(etf.ret6M)}">${fmtPct(etf.ret6M, 1)}</span> /
          <span class="${colorClass(etf.ret1Y)}">${fmtPct(etf.ret1Y, 1)}</span>
        </div>
      </div>
      <div class="detail-stat-card">
        <div class="d-lbl">연 배당률(분배율) / 총보수</div>
        <div class="d-val" style="color:#fde047;">
          연 ${(etf.divYield || 0).toFixed(2)}% <small style="color:#94a3b8; font-weight:500;">(보수 ${(etf.fee || 0).toFixed(3)}%)</small>
        </div>
      </div>
      <div class="detail-stat-card">
        <div class="d-lbl">20봉 최고가 / 최저가</div>
        <div class="d-val">
          <span class="up-text">${fmtNum(high20)}</span> / <span class="dn-text">${fmtNum(low20)}</span>
        </div>
      </div>
      <div class="detail-stat-card">
        <div class="d-lbl">이동평균선 (MA20 / MA60)</div>
        <div class="d-val">
          <span style="color:#ffbc00;">${fmtNum(ma20)}</span> / <span style="color:#a855f7;">${fmtNum(ma60)}</span>
        </div>
      </div>
      <div class="detail-stat-card">
        <div class="d-lbl">변동성 ATR(14) / RSI(14)</div>
        <div class="d-val">
          ${fmtNum(atr14)}원 / <span style="color:${rsi14 >= 70 ? '#f87171' : rsi14 <= 30 ? '#60a5fa' : '#34d399'};">RSI ${rsi14}</span>
        </div>
      </div>
    `;

    drawDetailInteractiveChart();
  }

  function drawDetailInteractiveChart() {
    if (!activeModalData || !activeModalData.candles) return;
    const canvas = document.getElementById('detailChartCanvas');
    const candles = activeModalData.candles;
    if (candles.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 1000;
    const h = rect.height || 410;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    const padLeft = 16;
    const padRight = 74;
    const padTop = 20;
    const priceH = Math.round(h * 0.68);
    const volTop = padTop + priceH + 18;
    const volH = h - volTop - 26;
    const plotW = w - padLeft - padRight;

    let minP = Infinity;
    let maxP = -Infinity;
    let maxVol = 1;
    for (const c of candles) {
      if (c.low < minP) minP = c.low;
      if (c.high > maxP) maxP = c.high;
      if (c.ma60 && c.ma60 < minP) minP = c.ma60;
      if (c.ma60 && c.ma60 > maxP) maxP = c.ma60;
      if (c.volume > maxVol) maxVol = c.volume;
    }
    if (maxP <= minP) maxP = minP + 10;
    const pRange = maxP - minP;
    const toY = (val) => padTop + priceH - ((val - minP) / pRange) * priceH;
    const stepX = plotW / candles.length;

    // Price horizontal grid & right axis labels
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';

    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const gy = padTop + priceH * ratio;
      const pVal = Math.round(maxP - pRange * ratio);
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(w - padRight, gy);
      ctx.stroke();
      ctx.fillText(fmtNum(pVal), w - padRight + 6, gy + 4);
    }

    // 20-bar High/Low channel dashed lines
    if (activeModalData.high20) {
      const hy = toY(activeModalData.high20);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.beginPath();
      ctx.moveTo(padLeft, hy);
      ctx.lineTo(w - padRight, hy);
      ctx.stroke();
      ctx.restore();
    }

    // Candles & Volume bars
    const barW = Math.max(2.5, Math.min(10, stepX * 0.7));
    candles.forEach((c, i) => {
      const cx = padLeft + i * stepX + stepX * 0.5;
      const isUp = c.close >= c.open;
      const color = isUp ? '#ef4444' : '#3b82f6';

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(cx, toY(c.high));
      ctx.lineTo(cx, toY(c.low));
      ctx.stroke();

      // Body
      const yO = toY(c.open);
      const yC = toY(c.close);
      const top = Math.min(yO, yC);
      const bh = Math.max(1.5, Math.abs(yC - yO));
      ctx.fillStyle = color;
      ctx.fillRect(cx - barW / 2, top, barW, bh);

      // Volume bar
      const vh = (c.volume / maxVol) * volH;
      ctx.fillStyle = isUp ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.45)';
      ctx.fillRect(cx - barW / 2, volTop + volH - vh, barW, vh);

      // Date X-axis labels
      if (i % 15 === 0 || i === candles.length - 1) {
        ctx.fillStyle = '#64748b';
        ctx.font = '10.5px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(c.date.slice(2), cx, h - 6);
      }
    });

    // Draw MA5, MA20, MA60
    const drawMA = (key, color, width) => {
      ctx.beginPath();
      candles.forEach((c, i) => {
        const val = c[key] || c.close;
        const x = padLeft + i * stepX + stepX * 0.5;
        const y = toY(val);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    drawMA('ma60', '#a855f7', 1.5);
    drawMA('ma20', '#ffbc00', 2.0);
    drawMA('ma5', '#38bdf8', 1.3);

    // Crosshair if hovering
    const targetIdx = modalHoverIndex >= 0 && modalHoverIndex < candles.length
      ? modalHoverIndex
      : candles.length - 1;
    const hc = candles[targetIdx];
    const prevC = targetIdx > 0 ? candles[targetIdx - 1] : hc;
    const chgPct = prevC.close > 0 ? (((hc.close - prevC.close) / prevC.close) * 100).toFixed(2) : '0.00';

    const readoutEl = document.getElementById('hoverOhlcText');
    if (readoutEl && hc) {
      readoutEl.innerHTML = `
        <b style="color:#f8fafc;">📅 ${hc.date}</b> &nbsp;|&nbsp;
        시가 <b>${fmtNum(hc.open)}</b> ·
        고가 <b class="up-text">${fmtNum(hc.high)}</b> ·
        저가 <b class="dn-text">${fmtNum(hc.low)}</b> ·
        종가 <b style="color:#fff;">${fmtNum(hc.close)}원 (${chgPct >= 0 ? '+' : ''}${chgPct}%)</b> &nbsp;|&nbsp;
        거래량 <b>${fmtNum(hc.volume)}</b> &nbsp;|&nbsp;
        <span style="color:#ffbc00;">MA20: ${fmtNum(hc.ma20)}</span>
      `;
    }

    if (modalHoverIndex >= 0 && modalHoverIndex < candles.length) {
      const hx = padLeft + modalHoverIndex * stepX + stepX * 0.5;
      const hy = toY(hc.close);
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.beginPath();
      ctx.moveTo(hx, padTop);
      ctx.lineTo(hx, volTop + volH);
      ctx.moveTo(padLeft, hy);
      ctx.lineTo(w - padRight, hy);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#ffbc00';
      ctx.beginPath();
      ctx.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ==================== COMPARE & 70:30 PENSION PORTFOLIO SIMULATOR ====================
  function openCompareModal() {
    const modal = document.getElementById('compareModal');
    modal.classList.add('open');
    renderCompareModal();
  }

  function renderCompareModal() {
    const selectedEtfs = savedCodes
      .map(code => allEtfs.find(x => x.code === code))
      .filter(Boolean);

    const canvas = document.getElementById('compareChartCanvas');
    const verdictEl = document.getElementById('pensionRuleVerdict');
    const tableWrap = document.getElementById('compareTableWrap');

    if (selectedEtfs.length === 0) {
      verdictEl.textContent = '비교함에 담긴 ETF가 없습니다. 각 ETF 카드 우측 상단의 [+ 비교] 버튼을 눌러 추가해 주세요.';
      tableWrap.innerHTML = '';
      return;
    }

    // Initialize default equal weights if not set
    const eqWeight = Math.round(100 / selectedEtfs.length);
    selectedEtfs.forEach((etf, idx) => {
      if (customWeights[etf.code] == null) {
        customWeights[etf.code] = idx === selectedEtfs.length - 1
          ? Math.max(0, 100 - eqWeight * (selectedEtfs.length - 1))
          : eqWeight;
      }
    });

    let totalWeight = selectedEtfs.reduce((acc, e) => acc + Number(customWeights[e.code] || 0), 0);
    if (totalWeight <= 0) totalWeight = 100;

    let riskWeight = 0;
    let safeWeight = 0;
    let weightedRet3M = 0;
    let weightedRet1Y = 0;
    let weightedDiv = 0;
    let weightedFee = 0;

    selectedEtfs.forEach(e => {
      const w = (Number(customWeights[e.code] || 0) / totalWeight) * 100;
      if (e.assetClass === 'SAFE') safeWeight += w;
      else riskWeight += w;
      weightedRet3M += (e.ret3M || 0) * (w / 100);
      weightedRet1Y += (e.ret1Y || 0) * (w / 100);
      weightedDiv += (e.divYield || 0) * (w / 100);
      weightedFee += (e.fee || 0) * (w / 100);
    });

    const riskPctRound = Math.round(riskWeight * 10) / 10;
    const safePctRound = Math.round(safeWeight * 10) / 10;

    document.getElementById('simRiskPct').textContent = `${riskPctRound}%`;
    document.getElementById('simSafePct').textContent = `${safePctRound}%`;

    const riskBar = document.getElementById('simRiskBar');
    const safeBar = document.getElementById('simSafeBar');
    riskBar.style.width = `${riskPctRound}%`;
    riskBar.textContent = riskPctRound >= 12 ? `위험자산 ${riskPctRound}%` : '';
    safeBar.style.width = `${safePctRound}%`;
    safeBar.textContent = safePctRound >= 12 ? `안전자산 ${safePctRound}%` : '';

    if (riskPctRound <= 70.0) {
      verdictEl.innerHTML = `<b style="color:#34d399;">✅ 적합 (퇴직연금 매수 가능):</b> 위험자산 비중이 <b>${riskPctRound}%</b>로 법정 한도(70%) 이내이며, 안전자산이 <b>${safePctRound}%</b> 확보되었습니다. (예상 1년 수익률 <b>${fmtPct(weightedRet1Y, 1)}</b> · 연배당률 <b>${weightedDiv.toFixed(2)}%</b> · 평균 보수 <b>${weightedFee.toFixed(3)}%</b>)`;
    } else {
      const needSafe = (riskPctRound - 70).toFixed(1);
      verdictEl.innerHTML = `<b style="color:#f87171;">⚠️ 한도 초과 주의:</b> 현재 위험자산 비중이 <b>${riskPctRound}%</b>로 퇴직연금(DC/IRP) 위험자산 한도(70%)를 <b>${needSafe}%p 초과</b>했습니다! 채권형·채권혼합(예: 엔비디아채권혼합/S&P500채권혼합)·TDF·CD금리 등 <b>🟢 안전자산 ETF</b>를 최소 30% 이상 편입해 주세요.`;
    }

    const palette = ['#ffbc00', '#38bdf8', '#f43f5e', '#34d399', '#a855f7', '#fb923c'];

    // Render interactive weight table
    tableWrap.innerHTML = `
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="border-bottom:1px solid #26334d; color:#94a3b8; text-align:left;">
            <th style="padding:8px;">종목명 (코드)</th>
            <th style="padding:8px;">자산군 분류</th>
            <th style="padding:8px;">비중 설정(%)</th>
            <th style="padding:8px;">현재가 (등락)</th>
            <th style="padding:8px;">3개월 / 1년 수익률</th>
            <th style="padding:8px;">연분배율 / 총보수</th>
            <th style="padding:8px;">관리</th>
          </tr>
        </thead>
        <tbody>
          ${selectedEtfs.map((e, idx) => {
            const color = palette[idx % palette.length];
            const wVal = customWeights[e.code] ?? 0;
            return `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:8px; font-weight:700;">
                  <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${color}; margin-right:6px;"></span>
                  ${e.name} <small style="color:#64748b;">(${e.code})</small>
                </td>
                <td style="padding:8px;">
                  <span class="asset-badge ${e.assetClass}">${e.assetClass === 'SAFE' ? '🟢 안전자산(100%)' : '🟠 위험자산(70%)'}</span>
                </td>
                <td style="padding:8px;">
                  <input type="number" class="weight-input" data-code="${e.code}" min="0" max="100" step="5" value="${wVal}"
                    style="width:68px; background:#090d16; border:1px solid #334155; color:#ffbc00; font-weight:800; padding:4px 8px; border-radius:6px;" /> %
                </td>
                <td style="padding:8px;">
                  ${fmtNum(e.price)}원 <span class="${colorClass(e.changePct)}">(${fmtPct(e.changePct)})</span>
                </td>
                <td style="padding:8px;">
                  <b class="${colorClass(e.ret3M)}">${fmtPct(e.ret3M, 1)}</b> / <b class="${colorClass(e.ret1Y)}">${fmtPct(e.ret1Y, 1)}</b>
                </td>
                <td style="padding:8px;">
                  연 ${(e.divYield || 0).toFixed(2)}% / ${(e.fee || 0).toFixed(3)}%
                </td>
                <td style="padding:8px;">
                  <button type="button" class="btn-card-act btn-rm-cmp" data-code="${e.code}">제외</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    tableWrap.querySelectorAll('.weight-input').forEach(inp => {
      inp.addEventListener('input', () => {
        customWeights[inp.dataset.code] = Math.max(0, Number(inp.value) || 0);
        renderCompareModal();
      });
    });

    tableWrap.querySelectorAll('.btn-rm-cmp').forEach(btn => {
      btn.addEventListener('click', () => {
        toggleSavedCode(btn.dataset.code);
        renderCompareModal();
      });
    });

    // Draw Multi-ETF Normalized Return Chart on compareChartCanvas
    requestAnimationFrame(() => {
      drawCompareOverlayChart(canvas, selectedEtfs, palette);
    });
  }

  function drawCompareOverlayChart(canvas, etfs, palette) {
    if (!canvas || etfs.length === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || 980;
    const h = rect.height || 340;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const padLeft = 18;
    const padRight = 68;
    const padTop = 36;
    const padBot = 26;
    const plotW = w - padLeft - padRight;
    const plotH = h - padTop - padBot;

    // Build normalized % series for each ETF from its miniCandles
    const seriesList = etfs.map((e, idx) => {
      const candles = e.miniCandles || [];
      const base = candles[0]?.close || 1;
      const pctPoints = candles.map(c => ((c.close - base) / base) * 100);
      return {
        etf: e,
        color: palette[idx % palette.length],
        points: pctPoints,
        dates: candles.map(c => c.date)
      };
    });

    let minPct = -2;
    let maxPct = 5;
    seriesList.forEach(s => {
      s.points.forEach(p => {
        if (p < minPct) minPct = p;
        if (p > maxPct) maxPct = p;
      });
    });
    const range = Math.max(1, maxPct - minPct);
    const toY = (val) => padTop + plotH - ((val - minPct) / range) * plotH;

    // Grid & Zero Line
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';

    for (let i = 0; i <= 4; i++) {
      const ratio = i / 4;
      const gy = padTop + plotH * ratio;
      const val = maxPct - range * ratio;
      ctx.beginPath();
      ctx.moveTo(padLeft, gy);
      ctx.lineTo(w - padRight, gy);
      ctx.stroke();
      ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(1)}%`, w - padRight + 6, gy + 4);
    }

    // Draw each ETF line
    seriesList.forEach((s, idx) => {
      const len = s.points.length;
      if (len < 2) return;
      const stepX = plotW / (len - 1);

      ctx.beginPath();
      s.points.forEach((p, i) => {
        const x = padLeft + i * stepX;
        const y = toY(p);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2.4;
      ctx.stroke();

      // Legend item at top
      const lx = padLeft + idx * 165;
      const lastPct = s.points[len - 1] || 0;
      ctx.fillStyle = s.color;
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`● ${s.etf.name.slice(0, 11)} (${fmtPct(lastPct, 1)})`, lx, 20);
    });
  }

  // ==================== EVENT LISTENERS ====================
  elSearchInput.addEventListener('input', () => {
    searchQuery = elSearchInput.value;
    elBtnClearSearch.style.display = searchQuery ? 'block' : 'none';
    showAllCards = false;
    applyFiltersAndRender();
  });

  elBtnClearSearch.addEventListener('click', () => {
    elSearchInput.value = '';
    searchQuery = '';
    elBtnClearSearch.style.display = 'none';
    applyFiltersAndRender();
  });

  elAssetTabs.querySelectorAll('.asset-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      elAssetTabs.querySelectorAll('.asset-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentAssetTab = tab.dataset.asset;
      showAllCards = false;
      applyFiltersAndRender();
    });
  });

  elTimeframeGroup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      elTimeframeGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      loadEtfList(currentTimeframe);
    });
  });

  elChartStyleGroup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      elChartStyleGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentChartStyle = btn.dataset.style;
      applyFiltersAndRender();
    });
  });

  elGridColsGroup.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      elGridColsGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentGridCols = Number(btn.dataset.cols);
      elGrid.classList.remove('cols-2', 'cols-3', 'cols-4', 'cols-6');
      elGrid.classList.add(`cols-${currentGridCols}`);
      applyFiltersAndRender();
    });
  });

  elSortSelect.addEventListener('change', () => {
    currentSort = elSortSelect.value;
    applyFiltersAndRender();
  });

  elBtnShowAll.addEventListener('click', () => {
    showAllCards = true;
    applyFiltersAndRender();
  });

  // Detail Modal Events
  document.getElementById('btnCloseDetailModal').addEventListener('click', () => {
    document.getElementById('detailModal').classList.remove('open');
  });

  document.querySelectorAll('#modalTfGroup button').forEach(btn => {
    btn.addEventListener('click', () => {
      if (activeModalCode) {
        openDetailModal(activeModalCode, btn.dataset.tf);
      }
    });
  });

  document.getElementById('btnModalToggleCompare').addEventListener('click', () => {
    if (activeModalCode) {
      toggleSavedCode(activeModalCode);
    }
  });

  const detailCanvas = document.getElementById('detailChartCanvas');
  function handleDetailPointer(clientX) {
    if (!activeModalData || !activeModalData.candles) return;
    const rect = detailCanvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const padLeft = 16;
    const padRight = 74;
    const plotW = rect.width - padLeft - padRight;
    const len = activeModalData.candles.length;
    const idx = Math.floor(((x - padLeft) / plotW) * len);
    if (idx >= 0 && idx < len && idx !== modalHoverIndex) {
      modalHoverIndex = idx;
      drawDetailInteractiveChart();
    }
  }

  detailCanvas.addEventListener('mousemove', (e) => handleDetailPointer(e.clientX));
  detailCanvas.addEventListener('touchstart', (e) => {
    if (e.touches && e.touches[0]) handleDetailPointer(e.touches[0].clientX);
  }, { passive: true });
  detailCanvas.addEventListener('touchmove', (e) => {
    if (e.touches && e.touches[0]) handleDetailPointer(e.touches[0].clientX);
  }, { passive: true });

  detailCanvas.addEventListener('mouseleave', () => {
    modalHoverIndex = -1;
    drawDetailInteractiveChart();
  });

  // Compare Modal Events
  document.getElementById('btnOpenCompareModal').addEventListener('click', openCompareModal);
  document.getElementById('btnDockCompare').addEventListener('click', openCompareModal);
  document.getElementById('btnCloseCompareModal').addEventListener('click', () => {
    document.getElementById('compareModal').classList.remove('open');
  });
  document.getElementById('btnDockClear').addEventListener('click', () => {
    savedCodes = [];
    customWeights = {};
    saveBasket();
    applyFiltersAndRender();
  });

  // Mobile QR Code & PWA Install Modal
  let deferredInstallPrompt = null;
  const btnPwaInstall = document.getElementById('btnPwaInstallPrompt');

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    if (btnPwaInstall) btnPwaInstall.style.display = 'block';
  });

  if (btnPwaInstall) {
    btnPwaInstall.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      btnPwaInstall.style.display = 'none';
    });
  }

  async function openMobileQrModal() {
    const modal = document.getElementById('mobileQrModal');
    if (!modal) return;
    modal.classList.add('open');

    let targetUrl = window.location.href;
    // If running on localhost, check if /api/netinfo returns a LAN IP for Wi-Fi mobile access
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
      try {
        const res = await fetch('/api/netinfo');
        if (res.ok) {
          const info = await res.json();
          if (info && info.ip && info.ip !== 'localhost') {
            targetUrl = `http://${info.ip}:${window.location.port || info.port || 3000}/kb-etf.html`;
          }
        }
      } catch (e) {}
    }

    const urlInput = document.getElementById('mobileAccessUrlInput');
    const qrImg = document.getElementById('qrCodeImg');
    if (urlInput) urlInput.value = targetUrl;
    if (qrImg) {
      qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=6&data=${encodeURIComponent(targetUrl)}`;
    }
  }

  const btnOpenMobileQr = document.getElementById('btnOpenMobileQrModal');
  if (btnOpenMobileQr) {
    btnOpenMobileQr.addEventListener('click', openMobileQrModal);
  }

  const btnCloseMobileQr = document.getElementById('btnCloseMobileQrModal');
  if (btnCloseMobileQr) {
    btnCloseMobileQr.addEventListener('click', () => {
      document.getElementById('mobileQrModal').classList.remove('open');
    });
  }

  const btnCopyUrl = document.getElementById('btnCopyMobileUrl');
  if (btnCopyUrl) {
    btnCopyUrl.addEventListener('click', () => {
      const inp = document.getElementById('mobileAccessUrlInput');
      if (!inp) return;
      navigator.clipboard.writeText(inp.value).then(() => {
        btnCopyUrl.textContent = '복사됨 ✓';
        setTimeout(() => { btnCopyUrl.textContent = '복사'; }, 1800);
      });
    });
  }

  // Register Service Worker for Mobile PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  // Close modals on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) bd.classList.remove('open');
    });
  });

  window.addEventListener('resize', () => {
    if (document.getElementById('detailModal').classList.contains('open')) {
      drawDetailInteractiveChart();
    }
  });

  // Init
  loadEtfList('day');
})();
