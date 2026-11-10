// Tom Doub R-System Frontend Logic (KRW & USD Stock Position Sizer, R-Journal, 3-Engine Simulator)

const state = {
  market: 'KR', // 'KR' or 'US'
  settings: {
    krwAccount: 10000000,
    usdAccount: 10000,
    defaultRiskPct: 1.0,
    fxRate: 1380
  },
  currentQuote: null,
  stocksList: [],
  trades: [],
  scannerFilter: 'ALL'
};

// Currency Formatter
function fmtMoney(val, market = state.market) {
  const num = Number(val) || 0;
  if (market === 'KR') {
    return '₩' + Math.round(num).toLocaleString('ko-KR');
  } else {
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}

let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
});

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupCalculatorEvents();
  setupJournalEvents();
  setupSimulatorEvents();
  setupResearchEvents();
  setupMobilePwaEvents();

  // Register Service Worker for Chrome mobile installation (PWA)
  if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Set default date
  document.getElementById('tDate').value = new Date().toISOString().slice(0, 10);

  await loadInitialData();
  await fetchQuote('005930');
});

function setupMobilePwaEvents() {
  const modal = document.getElementById('mobileConnectModal');
  const openBtn = document.getElementById('btnOpenMobileModal');
  const closeBtn = document.getElementById('btnCloseMobileModal');
  const installBtn = document.getElementById('btnTriggerInstallPrompt');
  const urlDisplay = document.getElementById('mobileUrlDisplay');

  if (openBtn && modal) {
    openBtn.addEventListener('click', async () => {
      modal.style.display = 'flex';
      urlDisplay.textContent = 'https://tom-doub-r.web.app';
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        await deferredInstallPrompt.userChoice;
        deferredInstallPrompt = null;
      } else {
        showToast('크롬 우측 상단 메뉴(⋮) → [앱 설치] 또는 [홈 화면에 추가]를 눌러주세요!');
      }
    });
  }
}

function setupTabs() {
  const btns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => b.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add('active');

      if (btn.dataset.tab === 'tab-journal') {
        renderJournal();
      } else if (btn.dataset.tab === 'tab-engine') {
        updateSimulator();
        renderScannerTable();
      } else if (btn.dataset.tab === 'tab-calc') {
        recalculatePosition();
      }
    });
  });
}

const FALLBACK_STOCKS = [
  { symbol: "005930.KS", code: "005930", name: "삼성전자", market: "KR", price: 59200, prevClose: 58500, high20: 61500, low20: 56800, ma50: 60100, atr14: 1350, volRatio: 145 },
  { symbol: "000660.KS", code: "000660", name: "SK하이닉스", market: "KR", price: 196500, prevClose: 192000, high20: 198000, low20: 178000, ma50: 184500, atr14: 5400, volRatio: 210 },
  { symbol: "373220.KS", code: "373220", name: "LG에너지솔루션", market: "KR", price: 412000, prevClose: 408000, high20: 425000, low20: 385000, ma50: 396000, atr14: 11500, volRatio: 115 },
  { symbol: "207940.KS", code: "207940", name: "삼성바이오로직스", market: "KR", price: 1035000, prevClose: 1020000, high20: 1080000, low20: 980000, ma50: 995000, atr14: 22000, volRatio: 130 },
  { symbol: "005380.KS", code: "005380", name: "현대차", market: "KR", price: 221000, prevClose: 219500, high20: 242000, low20: 215000, ma50: 234000, atr14: 5200, volRatio: 95 },
  { symbol: "035420.KS", code: "035420", name: "NAVER", market: "KR", price: 176500, prevClose: 173000, high20: 178000, low20: 165000, ma50: 170200, atr14: 4100, volRatio: 185 },
  { symbol: "012450.KS", code: "012450", name: "한화에어로스페이스", market: "KR", price: 389000, prevClose: 378000, high20: 392000, low20: 340000, ma50: 352000, atr14: 11200, volRatio: 235 },
  { symbol: "196170.KQ", code: "196170", name: "알테오젠", market: "KR", price: 385000, prevClose: 376000, high20: 402000, low20: 345000, ma50: 361000, atr14: 13500, volRatio: 195 },
  { symbol: "NVDA", code: "NVDA", name: "NVIDIA Corp", market: "US", price: 138.60, prevClose: 135.40, high20: 140.76, low20: 128.50, ma50: 129.80, atr14: 4.35, volRatio: 165 },
  { symbol: "AAPL", code: "AAPL", name: "Apple Inc.", market: "US", price: 228.50, prevClose: 226.80, high20: 236.48, low20: 221.00, ma50: 225.40, atr14: 3.90, volRatio: 105 },
  { symbol: "TSLA", code: "TSLA", name: "Tesla Inc.", market: "US", price: 254.20, prevClose: 249.00, high20: 265.10, low20: 215.00, ma50: 238.50, atr14: 9.80, volRatio: 220 },
  { symbol: "PLTR", code: "PLTR", name: "Palantir Technologies", market: "US", price: 44.85, prevClose: 43.20, high20: 45.20, low20: 38.90, ma50: 39.40, atr14: 1.65, volRatio: 245 }
];

const FALLBACK_TRADES = [
  { id: "t-1", date: "2026-10-15", market: "KR", name: "삼성전자", setup: "20일 신고가 돌파 + 거래량 200%", oneR: 100000, entryPrice: 60000, stopPrice: 57000, exitPrice: 57000, shares: 33, holdingDays: 3, notes: "계획대로 57,000원 지지선 이탈 시 즉시 손절 (-1.0R 원칙 준수)" },
  { id: "t-2", date: "2026-10-19", market: "KR", name: "SK하이닉스", setup: "Two Tight Days (2일 타이트 캔들)", oneR: 99000, entryPrice: 190000, stopPrice: 185000, exitPrice: 206000, shares: 19, holdingDays: 6, notes: "타이트한 손절폭 덕분에 비중을 실어 +3.20R 수익 달성" },
  { id: "t-3", date: "2026-10-26", market: "US", name: "NVIDIA Corp", setup: "50일선 지지 후 전고점 돌파", oneR: 100, entryPrice: 135.00, stopPrice: 130.00, exitPrice: 125.50, shares: 20, holdingDays: 1, notes: "손절가($130)에서 망설이다가 추가 하락 매도 (-1.90R 시스템 위반 경고)" },
  { id: "t-4", date: "2026-10-28", market: "US", name: "Palantir Technologies", setup: "VCP 변동성 축소 돌파", oneR: 98.1, entryPrice: 42.00, stopPrice: 40.50, exitPrice: 48.30, shares: 65, holdingDays: 4, notes: "빠른 모멘텀 분출 후 목표가 익절 완료 (+4.20R)" }
];

function buildLocalQuote(query) {
  const q = (query || '005930').trim().toUpperCase();
  let match = (state.stocksList.length ? state.stocksList : FALLBACK_STOCKS).find(
    s => s.symbol.toUpperCase() === q || s.code.toUpperCase() === q || s.name.toUpperCase().includes(q)
  ) || FALLBACK_STOCKS[0];
  const isKR = match.market === 'KR';
  const candles = [];
  let cur = match.ma50;
  const step = (match.price - match.ma50) / 28;
  for (let i = 29; i >= 0; i--) {
    const wave = Math.sin(i * 0.45) * (match.atr14 * 0.8);
    const closeVal = i === 0 ? match.price : cur + wave;
    const openVal = closeVal - (i % 2 === 0 ? match.atr14 * 0.3 : -match.atr14 * 0.25);
    const highVal = Math.max(openVal, closeVal) + match.atr14 * 0.45;
    const lowVal = Math.min(openVal, closeVal) - match.atr14 * 0.45;
    candles.push({
      open: isKR ? Math.round(openVal) : Number(openVal.toFixed(2)),
      high: isKR ? Math.round(highVal) : Number(highVal.toFixed(2)),
      low: isKR ? Math.round(lowVal) : Number(lowVal.toFixed(2)),
      close: isKR ? Math.round(closeVal) : Number(closeVal.toFixed(2))
    });
    cur += step;
  }
  return {
    source: 'local',
    symbol: match.symbol,
    name: match.name,
    market: match.market,
    price: match.price,
    prevClose: match.prevClose,
    latestLow: candles[candles.length - 1].low,
    atr14: match.atr14,
    high20: match.high20,
    low20: match.low20,
    ma50: match.ma50,
    volRatio: match.volRatio,
    candles
  };
}

async function loadInitialData() {
  try {
    const [dataRes, stocksRes] = await Promise.all([
      fetch('/api/data'),
      fetch('/api/stocks')
    ]);
    const data = await dataRes.json();
    const stocks = await stocksRes.json();

    if (data.settings) state.settings = data.settings;
    if (Array.isArray(data.trades)) state.trades = data.trades;
    if (Array.isArray(stocks)) state.stocksList = stocks;
  } catch (err) {
    // Fallback for file:// or offline mode using localStorage
    state.stocksList = FALLBACK_STOCKS;
    const saved = localStorage.getItem('tom_doub_r_data');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.settings) state.settings = parsed.settings;
        if (Array.isArray(parsed.trades)) state.trades = parsed.trades;
      } catch (_) {}
    } else {
      state.trades = FALLBACK_TRADES;
    }
  }

  renderQuickTickers();
  updateHeaderSummary();
  renderJournal();
  renderScannerTable();
  updateSimulator();
  updateDataBudget();
  updateBacktraderCode();
}

async function saveAppData() {
  const payload = {
    settings: state.settings,
    trades: state.trades
  };
  try {
    localStorage.setItem('tom_doub_r_data', JSON.stringify(payload));
    await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // Saved in localStorage when offline
  }
  updateHeaderSummary();
}

function renderQuickTickers() {
  const container = document.getElementById('quickTickers');
  container.innerHTML = '';
  state.stocksList.slice(0, 12).forEach(st => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ticker-pill';
    btn.textContent = `${st.market === 'KR' ? '🇰🇷' : '🇺🇸'} ${st.name}`;
    btn.addEventListener('click', () => {
      document.getElementById('symbolInput').value = st.code;
      fetchQuote(st.symbol);
    });
    container.appendChild(btn);
  });
}

async function fetchQuote(symbolQuery) {
  let quote;
  try {
    const res = await fetch(`/api/quote?symbol=${encodeURIComponent(symbolQuery)}`);
    if (!res.ok) throw new Error('API Error');
    quote = await res.json();
  } catch (err) {
    quote = buildLocalQuote(symbolQuery);
  }
  state.currentQuote = quote;
  setMarketMode(quote.market, false);

  // Populate stock banner
  document.getElementById('bannerMarket').textContent = quote.market;
  document.getElementById('bannerName').textContent = quote.name;
  document.getElementById('bannerSymbol').textContent = `(${quote.symbol})`;
  document.getElementById('bannerSource').textContent =
    quote.source === 'live' ? '● 실시간/일봉 시세 연동됨' : '● 내장 시세·ATR 데이터 적용됨';
  document.getElementById('bannerPrice').textContent = fmtMoney(quote.price, quote.market);
  document.getElementById('bannerAtr').textContent = fmtMoney(quote.atr14, quote.market);
  document.getElementById('banner20HL').textContent =
    `${fmtMoney(quote.high20, quote.market)} / ${fmtMoney(quote.low20, quote.market)}`;
  document.getElementById('bannerMaVol').textContent =
    `${fmtMoney(quote.ma50, quote.market)} / ${quote.volRatio}%`;

  // Set Entry Price & Logical Stop Price (Entry Low - 1 ATR by default)
  const entryInput = document.getElementById('inputEntryPrice');
  const stopInput = document.getElementById('inputStopPrice');
  const targetInput = document.getElementById('inputTargetPrice');

  entryInput.value = quote.price;
  const rawStop = quote.latestLow - quote.atr14;
  const logicalStop = quote.market === 'KR'
    ? Math.max(100, Math.round(rawStop / 50) * 50)
    : Math.max(0.1, Number(rawStop.toFixed(2)));
  stopInput.value = logicalStop < quote.price ? logicalStop : (
    quote.market === 'KR' ? Math.round(quote.price * 0.95) : Number((quote.price * 0.95).toFixed(2))
  );

  const riskPerShare = Number(entryInput.value) - Number(stopInput.value);
  const target3R = Number(entryInput.value) + riskPerShare * 3;
  targetInput.value = quote.market === 'KR' ? Math.round(target3R) : Number(target3R.toFixed(2));

  recalculatePosition();
}

function setMarketMode(market, updateDefaultPrices = true) {
  state.market = market;
  document.getElementById('btnMarketKR').classList.toggle('active', market === 'KR');
  document.getElementById('btnMarketUS').classList.toggle('active', market === 'US');

  const acctInput = document.getElementById('inputAccountSize');
  if (market === 'KR') {
    document.getElementById('lblAccountSize').textContent = '계좌 원금 (KRW 원화)';
    acctInput.value = state.settings.krwAccount;
    acctInput.step = 100000;
    if (updateDefaultPrices) {
      document.getElementById('inputEntryPrice').value = 10000;
      document.getElementById('inputStopPrice').value = 9500;
      document.getElementById('inputTargetPrice').value = 11500;
    }
  } else {
    document.getElementById('lblAccountSize').textContent = '계좌 원금 (USD 달러)';
    acctInput.value = state.settings.usdAccount;
    acctInput.step = 100;
    if (updateDefaultPrices) {
      document.getElementById('inputEntryPrice').value = 100;
      document.getElementById('inputStopPrice').value = 95;
      document.getElementById('inputTargetPrice').value = 115;
    }
  }
  recalculatePosition();
}

function setupCalculatorEvents() {
  document.getElementById('btnMarketKR').addEventListener('click', () => setMarketMode('KR', true));
  document.getElementById('btnMarketUS').addEventListener('click', () => setMarketMode('US', true));

  document.getElementById('btnFetchQuote').addEventListener('click', () => {
    const q = document.getElementById('symbolInput').value.trim();
    if (q) fetchQuote(q);
  });
  document.getElementById('symbolInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = document.getElementById('symbolInput').value.trim();
      if (q) fetchQuote(q);
    }
  });

  // Account & Risk inputs
  ['inputAccountSize', 'inputRiskPct', 'inputEntryPrice', 'inputStopPrice', 'inputTargetPrice'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
      if (id === 'inputAccountSize') {
        const val = Number(document.getElementById('inputAccountSize').value) || 0;
        if (state.market === 'KR') state.settings.krwAccount = val;
        else state.settings.usdAccount = val;
      }
      recalculatePosition();
    });
  });

  // Risk % preset buttons
  document.querySelectorAll('.preset-risk').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-risk').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('inputRiskPct').value = btn.dataset.val;
      recalculatePosition();
    });
  });

  // Logical Stop Price quick buttons
  document.getElementById('btnStopLowAtr').addEventListener('click', () => {
    if (!state.currentQuote) return;
    const q = state.currentQuote;
    const stop = q.latestLow - q.atr14;
    document.getElementById('inputStopPrice').value =
      state.market === 'KR' ? Math.round(stop) : Number(stop.toFixed(2));
    recalculatePosition();
  });

  document.getElementById('btnStopPriceAtr').addEventListener('click', () => {
    const entry = Number(document.getElementById('inputEntryPrice').value) || 0;
    const atr = state.currentQuote ? state.currentQuote.atr14 : entry * 0.03;
    const stop = entry - atr * 1.5;
    document.getElementById('inputStopPrice').value =
      state.market === 'KR' ? Math.round(stop) : Number(stop.toFixed(2));
    recalculatePosition();
  });

  document.getElementById('btnStop20Low').addEventListener('click', () => {
    if (!state.currentQuote) return;
    document.getElementById('inputStopPrice').value = state.currentQuote.low20;
    recalculatePosition();
  });

  document.getElementById('btnStop5Pct').addEventListener('click', () => {
    const entry = Number(document.getElementById('inputEntryPrice').value) || 0;
    const stop = entry * 0.95;
    document.getElementById('inputStopPrice').value =
      state.market === 'KR' ? Math.round(stop) : Number(stop.toFixed(2));
    recalculatePosition();
  });

  // Target R quick buttons
  document.querySelectorAll('[data-target-r]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-target-r]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const rMult = Number(btn.dataset.targetR);
      const entry = Number(document.getElementById('inputEntryPrice').value) || 0;
      const stop = Number(document.getElementById('inputStopPrice').value) || 0;
      const risk = Math.max(0, entry - stop);
      const target = entry + risk * rMult;
      document.getElementById('inputTargetPrice').value =
        state.market === 'KR' ? Math.round(target) : Number(target.toFixed(2));
      recalculatePosition();
    });
  });

  // Register position into R-Journal form
  document.getElementById('btnRegisterTrade').addEventListener('click', () => {
    const acct = Number(document.getElementById('inputAccountSize').value) || 0;
    const riskPct = Number(document.getElementById('inputRiskPct').value) || 1;
    const oneR = acct * (riskPct / 100);
    const entry = Number(document.getElementById('inputEntryPrice').value) || 0;
    const stop = Number(document.getElementById('inputStopPrice').value) || 0;
    const target = Number(document.getElementById('inputTargetPrice').value) || 0;
    const setup = document.getElementById('inputSetupType').value;
    const stockName = state.currentQuote ? `${state.currentQuote.name} (${state.currentQuote.symbol})` : '직접입력 종목';

    document.getElementById('tMarket').value = state.market;
    document.getElementById('tName').value = stockName;
    document.getElementById('tOneR').value = state.market === 'KR' ? Math.round(oneR) : Number(oneR.toFixed(2));
    document.getElementById('tEntry').value = entry;
    document.getElementById('tStop').value = stop;
    document.getElementById('tExit').value = target;
    document.getElementById('tSetup').value = setup;
    document.getElementById('tNotes').value = '1단계 R 역산 공식으로 진입 수량 산출 후 기록';

    updateTradeFormPreview();

    // Switch to Journal tab
    document.querySelector('[data-tab="tab-journal"]').click();
    showToast('매매 성적표 입력창에 현재 포지션이 복사되었습니다.');
  });
}

function recalculatePosition() {
  const mkt = state.market;
  const acct = Number(document.getElementById('inputAccountSize').value) || 0;
  const riskPct = Number(document.getElementById('inputRiskPct').value) || 1.0;
  const entry = Number(document.getElementById('inputEntryPrice').value) || 0;
  const stop = Number(document.getElementById('inputStopPrice').value) || 0;
  const target = Number(document.getElementById('inputTargetPrice').value) || 0;

  const oneR = acct * (riskPct / 100);
  document.getElementById('calcOneRDisplay').textContent = fmtMoney(oneR, mkt);

  const riskPerShare = entry - stop;
  const stopPct = entry > 0 ? ((riskPerShare / entry) * 100) : 0;

  if (riskPerShare <= 0) {
    document.getElementById('calcRiskPerShare').textContent = '손절가는 매수가보다 낮아야 합니다';
    document.getElementById('resShares').textContent = '0주';
    return;
  }

  document.getElementById('calcRiskPerShare').textContent =
    `${fmtMoney(riskPerShare, mkt)} (-${stopPct.toFixed(2)}%)`;

  // Reverse Formula: Shares = 1R / (Entry - Stop)
  const rawShares = oneR / riskPerShare;
  const shares = Math.max(0, Math.floor(rawShares));
  const totalCost = shares * entry;
  const weightPct = acct > 0 ? (totalCost / acct) * 100 : 0;
  const actualMaxLoss = shares * riskPerShare;
  const actualLossPctAcct = acct > 0 ? (actualMaxLoss / acct) * 100 : 0;

  const rewardPerShare = target - entry;
  const rrRatio = riskPerShare > 0 ? rewardPerShare / riskPerShare : 0;
  const expectedProfit = shares * rewardPerShare;

  document.getElementById('formulaDisplay').innerHTML =
    `매수 수량 = 1R 위험액 (${fmtMoney(oneR, mkt)}) ÷ 1주 손실폭 (${fmtMoney(riskPerShare, mkt)}) = <strong>${shares.toLocaleString()}주</strong>`;

  document.getElementById('resShares').textContent = `${shares.toLocaleString()}주`;
  document.getElementById('resTotalCost').textContent = `총 매수 금액: ${fmtMoney(totalCost, mkt)}`;
  document.getElementById('resWeightPct').textContent = `${weightPct.toFixed(1)}%`;

  const weightWarnEl = document.getElementById('resWeightWarning');
  if (weightPct > 100) {
    const cappedShares = Math.floor(acct / entry);
    weightWarnEl.textContent = `⚠️ 손절폭이 매우 좁아 원금(100%) 초과 → 현금 한도 내 최대 ${cappedShares.toLocaleString()}주 가능`;
    weightWarnEl.style.color = '#f59e0b';
  } else {
    weightWarnEl.textContent = `손절폭 -${stopPct.toFixed(1)}% 반영 자동 비중 조절 완료`;
    weightWarnEl.style.color = '#94a3b8';
  }

  document.getElementById('resMaxLoss').textContent = `-${fmtMoney(actualMaxLoss, mkt)}`;
  document.getElementById('resLossPctOfAcct').textContent =
    `계좌 원금의 -${actualLossPctAcct.toFixed(2)}% (1.0R 완벽 통제)`;

  document.getElementById('resTargetProfit').textContent =
    `+${fmtMoney(expectedProfit, mkt)} (+${rrRatio.toFixed(1)}R)`;
  document.getElementById('resRRRatio').textContent =
    rrRatio >= 2.0
      ? `손익비 1 : ${rrRatio.toFixed(2)} (톰 돕 기준 합격 ✅)`
      : `손익비 1 : ${rrRatio.toFixed(2)} (최소 +2R 이상 목표 권장 ⚠️)`;

  // R-Ladder Prices
  document.getElementById('ladderMinus2R').textContent = fmtMoney(entry - riskPerShare * 2, mkt);
  document.getElementById('ladderMinus1R').textContent = fmtMoney(stop, mkt);
  document.getElementById('ladderEntry').textContent = fmtMoney(entry, mkt);
  document.getElementById('ladderPlus2R').textContent = fmtMoney(entry + riskPerShare * 2, mkt);
  document.getElementById('ladderPlus3R').textContent = fmtMoney(entry + riskPerShare * 3, mkt);

  renderRuleChecks(entry, stop, rrRatio);
  drawPriceAndRChart(entry, stop, target);
  updateHeaderSummary();
}

function renderRuleChecks(entry, stop, rrRatio) {
  const grid = document.getElementById('ruleCheckGrid');
  const q = state.currentQuote;
  if (!q) return;

  const isAboveMa50 = entry >= q.ma50;
  const isNear20High = entry >= q.high20 * 0.97;
  const isHighVol = q.volRatio >= 150;

  grid.innerHTML = `
    <div class="rule-pill ${isAboveMa50 ? 'pass' : 'warn'}">
      <strong>50일 이평선 위 여부</strong><br/>
      ${isAboveMa50 ? '✅ 통과 (추세 우상향)' : '⚠️ 50일선 아래 (역추세 주의)'}
    </div>
    <div class="rule-pill ${isNear20High ? 'pass' : 'warn'}">
      <strong>20일 신고가 돌파/근접</strong><br/>
      ${isNear20High ? '✅ 20일 고가권 돌파 셋업' : '⏳ 박스권 내부 대기'}
    </div>
    <div class="rule-pill ${isHighVol && rrRatio >= 2 ? 'pass' : 'warn'}">
      <strong>거래량(${q.volRatio}%) & 손익비(${rrRatio.toFixed(1)}R)</strong><br/>
      ${rrRatio >= 2 ? '✅ +2R 이상 기대수익 확보' : '⚠️ 손익비 +2R 이상 권장'}
    </div>
  `;
}

function drawPriceAndRChart(entry, stop, target) {
  const canvas = document.getElementById('priceChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const candles = (state.currentQuote && state.currentQuote.candles) || [];
  const allPrices = [entry, stop, target];
  candles.forEach(c => {
    allPrices.push(c.high, c.low);
  });

  const minP = Math.min(...allPrices) * 0.985;
  const maxP = Math.max(...allPrices) * 1.015;
  const range = Math.max(1e-6, maxP - minP);

  const yOf = (p) => h - 22 - ((p - minP) / range) * (h - 40);

  // Draw shaded R zones
  const yEntry = yOf(entry);
  const yStop = yOf(stop);
  const yTarget = yOf(target);

  // Stop zone (-1R)
  ctx.fillStyle = 'rgba(244, 63, 94, 0.10)';
  ctx.fillRect(40, Math.min(yEntry, yStop), w - 130, Math.abs(yStop - yEntry));

  // Target zone (+R)
  ctx.fillStyle = 'rgba(16, 185, 129, 0.10)';
  ctx.fillRect(40, Math.min(yEntry, yTarget), w - 130, Math.abs(yEntry - yTarget));

  // Draw candlesticks
  if (candles.length > 0) {
    const plotW = w - 150;
    const stepX = plotW / candles.length;
    candles.forEach((c, idx) => {
      const x = 48 + idx * stepX;
      const isUp = c.close >= c.open;
      ctx.strokeStyle = isUp ? '#10b981' : '#f43f5e';
      ctx.fillStyle = isUp ? '#10b981' : '#f43f5e';

      // Wick
      ctx.beginPath();
      ctx.moveTo(x, yOf(c.high));
      ctx.lineTo(x, yOf(c.low));
      ctx.stroke();

      // Body
      const yOpen = yOf(c.open);
      const yClose = yOf(c.close);
      const top = Math.min(yOpen, yClose);
      const bodyH = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillRect(x - 3, top, 6, bodyH);
    });
  }

  // Draw Horizontal R Lines
  const drawLevel = (price, label, color) => {
    const y = yOf(price);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 15, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`${label}: ${fmtMoney(price)}`, w - 145, Math.max(14, Math.min(h - 8, y - 4)));
  };

  drawLevel(target, '목표가', '#10b981');
  drawLevel(entry, '진입가(0R)', '#38bdf8');
  drawLevel(stop, '손절가(-1R)', '#f43f5e');
}

// ==================== TAB 2: R-MULTIPLE JOURNAL ====================

function computeTradeR(trade) {
  const riskPerShare = trade.entryPrice - trade.stopPrice;
  if (riskPerShare <= 0) return 0;
  const pnlPerShare = trade.exitPrice - trade.entryPrice;
  return pnlPerShare / riskPerShare;
}

function diagnoseTradeR(rVal) {
  if (rVal >= 2.0) {
    return { label: `+${rVal.toFixed(2)}R (우수 엣지 실현)`, cls: 'win', ruleOk: true };
  }
  if (rVal >= 0) {
    return { label: `+${rVal.toFixed(2)}R (소폭 익절/본절)`, cls: 'win', ruleOk: true };
  }
  if (rVal >= -1.15) {
    return { label: `${rVal.toFixed(2)}R (원칙 준수 칼손절 ✅)`, cls: 'rule-loss', ruleOk: true };
  }
  return { label: `${rVal.toFixed(2)}R (⚠️ 시스템 위반·손절 미룸/슬리피지)`, cls: 'violation', ruleOk: false };
}

function setupJournalEvents() {
  ['tEntry', 'tStop', 'tExit', 'tOneR'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateTradeFormPreview);
  });

  document.getElementById('tradeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const market = document.getElementById('tMarket').value;
    const name = document.getElementById('tName').value.trim();
    const date = document.getElementById('tDate').value;
    const oneR = Number(document.getElementById('tOneR').value) || 100000;
    const entryPrice = Number(document.getElementById('tEntry').value) || 0;
    const stopPrice = Number(document.getElementById('tStop').value) || 0;
    const exitPrice = Number(document.getElementById('tExit').value) || 0;
    const holdingDays = Number(document.getElementById('tHoldDays').value) || 1;
    const setup = document.getElementById('tSetup').value.trim();
    const notes = document.getElementById('tNotes').value.trim();

    if (entryPrice <= stopPrice) {
      alert('손절가는 매수가보다 낮아야 합니다.');
      return;
    }

    const shares = Math.max(1, Math.floor(oneR / (entryPrice - stopPrice)));
    const newTrade = {
      id: 't-' + Date.now(),
      date,
      market,
      name,
      setup,
      oneR,
      entryPrice,
      stopPrice,
      exitPrice,
      shares,
      holdingDays,
      notes
    };

    state.trades.push(newTrade);
    await saveAppData();
    renderJournal();
    showToast('R 매매 성적표에 기록되었습니다.');
  });
}

function updateTradeFormPreview() {
  const entry = Number(document.getElementById('tEntry').value) || 0;
  const stop = Number(document.getElementById('tStop').value) || 0;
  const exit = Number(document.getElementById('tExit').value) || 0;
  const risk = entry - stop;
  const previewEl = document.getElementById('tPreviewR');

  if (risk <= 0) {
    previewEl.textContent = '손절가 확인 필요';
    return;
  }
  const rVal = (exit - entry) / risk;
  const diag = diagnoseTradeR(rVal);
  previewEl.textContent = diag.label;
}

function renderJournal() {
  const tbody = document.getElementById('tradesTableBody');
  tbody.innerHTML = '';

  let totalR = 0;
  let winCount = 0;
  let winRSum = 0;
  let lossCount = 0;
  let lossRSum = 0;
  let ruleFollowedCount = 0;
  let holdDaysSum = 0;

  const rSeries = [0];

  state.trades.forEach((tr) => {
    const rVal = computeTradeR(tr);
    const diag = diagnoseTradeR(rVal);
    totalR += rVal;
    rSeries.push(Number(totalR.toFixed(2)));
    holdDaysSum += Number(tr.holdingDays || 1);

    if (rVal > 0) {
      winCount++;
      winRSum += rVal;
    } else {
      lossCount++;
      lossRSum += Math.abs(rVal);
    }
    if (diag.ruleOk) ruleFollowedCount++;

    const pnlMoney = rVal * tr.oneR;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>
        <strong>${tr.date}</strong><br/>
        <small>${tr.holdingDays || 1}일 보유</small>
      </td>
      <td>
        <strong>${tr.market === 'KR' ? '🇰🇷' : '🇺🇸'} ${tr.name}</strong><br/>
        <small style="color:#94a3b8">${tr.setup || '-'}</small>
      </td>
      <td>
        진입: ${fmtMoney(tr.entryPrice, tr.market)}<br/>
        손절: <span style="color:#f43f5e">${fmtMoney(tr.stopPrice, tr.market)}</span> →
        청산: <strong>${fmtMoney(tr.exitPrice, tr.market)}</strong>
      </td>
      <td>
        1R = ${fmtMoney(tr.oneR, tr.market)}<br/>
        <small>손익: ${pnlMoney >= 0 ? '+' : '-'}${fmtMoney(Math.abs(pnlMoney), tr.market)}</small>
      </td>
      <td>
        <span class="r-badge ${diag.cls}">${rVal >= 0 ? '+' : ''}${rVal.toFixed(2)}R</span>
      </td>
      <td>
        <div>${diag.label}</div>
        <small style="color:#94a3b8">${tr.notes || ''}</small>
      </td>
      <td>
        <button type="button" class="btn-chip" data-del="${tr.id}">삭제</button>
      </td>
    `;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.trades = state.trades.filter(t => t.id !== btn.dataset.del);
      await saveAppData();
      renderJournal();
    });
  });

  const count = state.trades.length;
  const winRate = count > 0 ? (winCount / count) * 100 : 0;
  const avgWinR = winCount > 0 ? winRSum / winCount : 0;
  const avgLossR = lossCount > 0 ? lossRSum / lossCount : 0;
  const expectancyR = count > 0 ? totalR / count : 0;
  const avgHold = count > 0 ? holdDaysSum / count : 0;
  const compliancePct = count > 0 ? (ruleFollowedCount / count) * 100 : 100;

  document.getElementById('jTotalTrades').textContent = `${count}회`;
  document.getElementById('jWinRate').textContent = `승률: ${winRate.toFixed(1)}% (${winCount}승 ${lossCount}패)`;
  document.getElementById('jAvgWinLoss').textContent = `+${avgWinR.toFixed(2)}R / -${avgLossR.toFixed(2)}R`;
  document.getElementById('jPayoffRatio').textContent =
    `손익비(Payoff): ${avgLossR > 0 ? (avgWinR / avgLossR).toFixed(2) : '∞'}`;
  document.getElementById('jExpectancyR').textContent = `${expectancyR >= 0 ? '+' : ''}${expectancyR.toFixed(2)}R / 회`;
  document.getElementById('jExpectancyStatus').textContent =
    expectancyR > 0 ? '✅ 양(+)의 수학적 엣지 확보됨' : '⚠️ 손익비 개선 또는 손절 원칙 준수 필요';
  document.getElementById('jAvgHoldDays').textContent = `${avgHold.toFixed(1)}일`;
  document.getElementById('jRuleCompliance').textContent =
    `원칙 준수율 (-1R 칼손절): ${compliancePct.toFixed(0)}%`;

  drawRCurveChart(rSeries);
  updateHeaderSummary();
}

function drawRCurveChart(rSeries) {
  const canvas = document.getElementById('rCurveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const minR = Math.min(0, ...rSeries) - 1;
  const maxR = Math.max(2, ...rSeries) + 1;
  const range = Math.max(1, maxR - minR);

  const xOf = (i) => 45 + (i / Math.max(1, rSeries.length - 1)) * (w - 70);
  const yOf = (r) => h - 28 - ((r - minR) / range) * (h - 48);

  // Zero R baseline
  const yZero = yOf(0);
  ctx.strokeStyle = '#334155';
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(40, yZero);
  ctx.lineTo(w - 20, yZero);
  ctx.stroke();
  ctx.setLineDash([]);

  // Equity line in R
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  rSeries.forEach((r, idx) => {
    const x = xOf(idx);
    const y = yOf(r);
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Points & labels
  rSeries.forEach((r, idx) => {
    const x = xOf(idx);
    const y = yOf(r);
    ctx.fillStyle = r >= 0 ? '#10b981' : '#f43f5e';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '11px sans-serif';
    ctx.fillText(`${r >= 0 ? '+' : ''}${r}R`, x - 14, y - 8);
  });
}

function updateHeaderSummary() {
  const krw = state.settings.krwAccount;
  const usd = state.settings.usdAccount;
  const riskPct = Number(document.getElementById('inputRiskPct')?.value) || 1.0;

  document.getElementById('headerKrwAcct').textContent = fmtMoney(krw, 'KR');
  document.getElementById('headerKrw1R').textContent = `1R (${riskPct}%) = ${fmtMoney(krw * (riskPct / 100), 'KR')}`;
  document.getElementById('headerUsdAcct').textContent = fmtMoney(usd, 'US');
  document.getElementById('headerUsd1R').textContent = `1R (${riskPct}%) = ${fmtMoney(usd * (riskPct / 100), 'US')}`;

  let totalR = 0;
  state.trades.forEach(t => { totalR += computeTradeR(t); });
  const exp = state.trades.length > 0 ? totalR / state.trades.length : 0;

  document.getElementById('headerTotalR').textContent = `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`;
  document.getElementById('headerExpectancy').textContent =
    `1회 기대값(Edge): ${exp >= 0 ? '+' : ''}${exp.toFixed(2)}R`;
}

// ==================== TAB 3: 3-ENGINE COMPOUNDING SIMULATOR & SCANNER ====================

function setupSimulatorEvents() {
  ['simWinRate', 'simAvgWinR', 'simRiskPct', 'simTradesPerYear'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateSimulator);
  });

  document.getElementById('btnLoadMyStatsToSim').addEventListener('click', () => {
    if (state.trades.length === 0) {
      showToast('기록된 매매가 없어 기본값을 유지합니다.');
      return;
    }
    let wins = 0;
    let winSum = 0;
    state.trades.forEach(t => {
      const r = computeTradeR(t);
      if (r > 0) {
        wins++;
        winSum += r;
      }
    });
    const wr = Math.round((wins / state.trades.length) * 100);
    const avgW = wins > 0 ? (winSum / wins) : 2.5;

    document.getElementById('simWinRate').value = Math.min(75, Math.max(25, wr));
    document.getElementById('simAvgWinR').value = Math.min(5.0, Math.max(1.2, avgW.toFixed(1)));
    updateSimulator();
    showToast('내 매매 성적표의 승률·손익비를 복리 엔진에 반영했습니다.');
  });

  // Scanner Filter Buttons
  document.querySelectorAll('.scan-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.scan-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.scannerFilter = btn.dataset.filter;
      renderScannerTable();
    });
  });
}

function updateSimulator() {
  const winRate = Number(document.getElementById('simWinRate').value) / 100;
  const avgWinR = Number(document.getElementById('simAvgWinR').value);
  const riskPct = Number(document.getElementById('simRiskPct').value) / 100;
  const tradesHigh = Number(document.getElementById('simTradesPerYear').value);
  const tradesLow = 25;

  document.getElementById('simWinRateVal').textContent = `${Math.round(winRate * 100)}%`;
  document.getElementById('simAvgWinRVal').textContent = `+${avgWinR.toFixed(1)}R`;
  document.getElementById('simRiskPctVal').textContent = `${(riskPct * 100).toFixed(2)}%`;
  document.getElementById('simTradesPerYearVal').textContent = `${tradesHigh}회 / 년`;

  // Geometric compounding per trade: E[growth] = (1 + avgWinR * riskPct)^winRate * (1 - 1.0 * riskPct)^(1 - winRate)
  const growthPerTrade =
    Math.pow(1 + avgWinR * riskPct, winRate) * Math.pow(1 - riskPct, 1 - winRate);

  const finalLowMult = Math.pow(growthPerTrade, tradesLow);
  const finalHighMult = Math.pow(growthPerTrade, tradesHigh);

  const lowPct = (finalLowMult - 1) * 100;
  const highPct = (finalHighMult - 1) * 100;

  const baseKRW = 1000; // 1,000만 원 단위
  document.getElementById('simLowTurnoverReturn').textContent =
    `${lowPct >= 0 ? '+' : ''}${lowPct.toFixed(1)}%`;
  document.getElementById('simLowTurnoverFinal').textContent =
    `1,000만 원 → ${Math.round(baseKRW * finalLowMult).toLocaleString()}만 원`;

  document.getElementById('simHighTurnoverReturn').textContent =
    `${highPct >= 0 ? '+' : ''}${highPct.toFixed(1)}%`;
  document.getElementById('simHighTurnoverFinal').textContent =
    `1,000만 원 → ${Math.round(baseKRW * finalHighMult).toLocaleString()}만 원`;

  drawCompoundChart(growthPerTrade, tradesLow, tradesHigh);
}

function drawCompoundChart(growthPerTrade, tradesLow, tradesHigh) {
  const canvas = document.getElementById('compoundChartCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const steps = 12; // 12 months
  const lowPoints = [];
  const highPoints = [];
  for (let m = 0; m <= steps; m++) {
    const frac = m / steps;
    lowPoints.push(Math.pow(growthPerTrade, tradesLow * frac));
    highPoints.push(Math.pow(growthPerTrade, tradesHigh * frac));
  }

  const maxMult = Math.max(1.5, ...highPoints, ...lowPoints) * 1.05;
  const minMult = Math.min(0.8, ...highPoints, ...lowPoints);

  const xOf = (m) => 45 + (m / steps) * (w - 75);
  const yOf = (mult) => h - 26 - ((mult - minMult) / (maxMult - minMult)) * (h - 45);

  // Draw Low Turnover Line
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  lowPoints.forEach((val, idx) => {
    if (idx === 0) ctx.moveTo(xOf(idx), yOf(val));
    else ctx.lineTo(xOf(idx), yOf(val));
  });
  ctx.stroke();

  // Draw High Turnover Line
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 3;
  ctx.beginPath();
  highPoints.forEach((val, idx) => {
    if (idx === 0) ctx.moveTo(xOf(idx), yOf(val));
    else ctx.lineTo(xOf(idx), yOf(val));
  });
  ctx.stroke();

  ctx.fillStyle = '#f59e0b';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillText(`고속 회전 (${tradesHigh}회): x${highPoints[steps].toFixed(2)}배`, w - 165, Math.max(18, yOf(highPoints[steps]) - 6));

  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`저속 회전 (25회): x${lowPoints[steps].toFixed(2)}배`, w - 165, Math.min(h - 10, yOf(lowPoints[steps]) + 14));
}

function renderScannerTable() {
  const tbody = document.getElementById('scannerTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = state.stocksList.filter(st => {
    if (state.scannerFilter === 'KR') return st.market === 'KR';
    if (state.scannerFilter === 'US') return st.market === 'US';
    if (state.scannerFilter === 'BREAKOUT') {
      return st.price >= st.ma50 && st.volRatio >= 150 && st.price >= st.high20 * 0.96;
    }
    return true;
  });

  filtered.forEach(st => {
    const maDiffPct = ((st.price - st.ma50) / st.ma50) * 100;
    const highProxPct = (st.price / st.high20) * 100;
    const atrPct = (st.atr14 / st.price) * 100;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <strong>${st.market === 'KR' ? '🇰🇷' : '🇺🇸'} ${st.name}</strong>
        <small style="color:#94a3b8">(${st.code})</small>
      </td>
      <td><strong>${fmtMoney(st.price, st.market)}</strong></td>
      <td style="color:${maDiffPct >= 0 ? '#10b981' : '#f43f5e'}">
        ${maDiffPct >= 0 ? '+' : ''}${maDiffPct.toFixed(1)}%
      </td>
      <td>${highProxPct.toFixed(1)}%</td>
      <td>
        <span class="r-badge ${st.volRatio >= 180 ? 'win' : 'rule-loss'}">${st.volRatio}%</span>
      </td>
      <td>${fmtMoney(st.atr14, st.market)} (-${atrPct.toFixed(1)}%)</td>
      <td>
        <button type="button" class="btn-chip" data-load-symbol="${st.symbol}">1R 수량 계산 →</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-load-symbol]').forEach(btn => {
    btn.addEventListener('click', () => {
      const sym = btn.dataset.loadSymbol;
      document.getElementById('symbolInput').value = sym;
      fetchQuote(sym);
      document.querySelector('[data-tab="tab-calc"]').click();
      showToast(`${sym} 시세와 ATR을 1단계 계산기에 불러왔습니다.`);
    });
  });
}

// ==================== TAB 4: RESEARCH & FOOL'S GOLD PREVENTION ====================

function setupResearchEvents() {
  ['budgetStartYear', 'budgetEndYear'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateDataBudget);
  });
  ['btMaPeriod', 'btBreakoutPeriod', 'btVolMult'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateBacktraderCode);
  });
  document.getElementById('btnCopyBtCode').addEventListener('click', () => {
    const code = document.getElementById('btCodeOutput').textContent;
    navigator.clipboard.writeText(code);
    showToast('Backtrader 검증 코드가 클립보드에 복사되었습니다.');
  });
}

function updateDataBudget() {
  const s = Number(document.getElementById('budgetStartYear').value) || 2016;
  const e = Number(document.getElementById('budgetEndYear').value) || 2026;
  const total = Math.max(3, e - s);
  const y1 = s + Math.floor(total * 0.5);
  const y2 = s + Math.floor(total * 0.8);

  document.getElementById('segExplore').innerHTML = `① 탐색용 (In-Sample 50%)<br><strong>${s} ~ ${y1}</strong>`;
  document.getElementById('segRefine').innerHTML = `② 다듬기용 (Validation 30%)<br><strong>${y1 + 1} ~ ${y2}</strong>`;
  document.getElementById('segLock').innerHTML = `🔒 ③ 최종 확인용 (Out-of-Sample 20%)<br><strong>${y2 + 1} ~ ${e} (단 1회 실행)</strong>`;
}

function updateBacktraderCode() {
  const ma = Number(document.getElementById('btMaPeriod').value) || 50;
  const bo = Number(document.getElementById('btBreakoutPeriod').value) || 20;
  const vol = (Number(document.getElementById('btVolMult').value) || 200) / 100;

  const code = `import backtrader as bt

class TomDoubRBreakoutStrategy(bt.Strategy):
    """
    톰 돕(Tom Doub) 1R 리스크 고정 + 기계적 돌파 백테스트 (룩어헤드 편향 방지)
    데이터 3분할 원칙: 탐색용 / 다듬기용 / 최종 확인용(Out-of-Sample) 분리 실행 필수
    """
    params = dict(
        ma_period=${ma},
        breakout_period=${bo},
        vol_mult=${vol.toFixed(1)},
        atr_period=14,
        risk_per_trade=0.01,  # 1R = 계좌의 1.0% 고정
        target_r=3.0          # +3.0R 목표가
    )

    def __init__(self):
        self.sma = bt.indicators.SimpleMovingAverage(self.data.close, period=self.p.ma_period)
        self.highest = bt.indicators.Highest(self.data.high(-1), period=self.p.breakout_period)
        self.avg_vol = bt.indicators.SimpleMovingAverage(self.data.volume(-1), period=self.p.breakout_period)
        self.atr = bt.indicators.ATR(self.data, period=self.p.atr_period)
        self.stop_price = None
        self.target_price = None

    def next(self):
        if not self.position:
            # 기계적 숫자화 진입 규칙
            cond_trend = self.data.close[0] > self.sma[0]
            cond_breakout = self.data.close[0] > self.highest[0]
            cond_vol = self.data.volume[0] >= (self.avg_vol[0] * self.p.vol_mult)

            if cond_trend and cond_breakout and cond_vol:
                entry_price = self.data.close[0]
                logical_stop = self.data.low[0] - self.atr[0]
                risk_per_share = entry_price - logical_stop
                if risk_per_share > 0:
                    one_r_cash = self.broker.getvalue() * self.p.risk_per_trade
                    shares = int(one_r_cash // risk_per_share)
                    if shares > 0:
                        self.buy(size=shares)
                        self.stop_price = logical_stop
                        self.target_price = entry_price + (risk_per_share * self.p.target_r)
        else:
            # -1.0R 칼손절 또는 +Target R 익절
            if self.data.low[0] <= self.stop_price or self.data.high[0] >= self.target_price:
                self.close()`;

  document.getElementById('btCodeOutput').textContent = code;
}
