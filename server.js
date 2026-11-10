const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const kbCatalog = require('./data/kb-etf-catalog');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Default sample data demonstrating Tom Doub's R-system
const DEFAULT_DATA = {
  settings: {
    krwAccount: 10000000,   // 1,000만 원
    usdAccount: 10000,      // $10,000
    defaultRiskPct: 1.0,    // 1.0% (1R)
    fxRate: 1380            // USD/KRW 환율
  },
  trades: [
    {
      id: "t-sample-1",
      date: "2026-10-15",
      exitDate: "2026-10-18",
      market: "KR",
      symbol: "005930.KS",
      name: "삼성전자",
      setup: "20일 신고가 돌파 + 거래량 200%",
      accountSize: 10000000,
      riskPct: 1.0,
      oneR: 100000,
      entryPrice: 60000,
      stopPrice: 57000,
      targetPrice: 69000,
      exitPrice: 57000,
      shares: 33,
      holdingDays: 3,
      status: "CLOSED",
      ruleFollowed: true,
      notes: "계획대로 57,000원 지지선 이탈 시 즉시 손절 실행 (-1.0R 원칙 준수)"
    },
    {
      id: "t-sample-2",
      date: "2026-10-19",
      exitDate: "2026-10-25",
      market: "KR",
      symbol: "000660.KS",
      name: "SK하이닉스",
      setup: "Two Tight Days (2일 타이트 캔들)",
      accountSize: 9900000,
      riskPct: 1.0,
      oneR: 99000,
      entryPrice: 190000,
      stopPrice: 185000,
      targetPrice: 205000,
      exitPrice: 206000,
      shares: 19,
      holdingDays: 6,
      status: "CLOSED",
      ruleFollowed: true,
      notes: "타이트한 손절폭(-2.6%) 덕분에 비중을 실어 +3.07R 수익 달성"
    },
    {
      id: "t-sample-3",
      date: "2026-10-26",
      exitDate: "2026-10-27",
      market: "US",
      symbol: "NVDA",
      name: "NVIDIA Corp",
      setup: "50일선 지지 후 전고점 돌파",
      accountSize: 10000,
      riskPct: 1.0,
      oneR: 100,
      entryPrice: 135.00,
      stopPrice: 130.00,
      targetPrice: 150.00,
      exitPrice: 125.50,
      shares: 20,
      holdingDays: 1,
      status: "CLOSED",
      ruleFollowed: false,
      notes: "손절가($130)에서 망설이다가 장중 추가 하락에 뒤늦게 매도 (-1.90R 시스템 위반 경고)"
    },
    {
      id: "t-sample-4",
      date: "2026-10-28",
      exitDate: "2026-11-01",
      market: "US",
      symbol: "PLTR",
      name: "Palantir Technologies",
      setup: "VCP 변동성 축소 돌파",
      accountSize: 9810,
      riskPct: 1.0,
      oneR: 98.1,
      entryPrice: 42.00,
      stopPrice: 40.50,
      targetPrice: 48.00,
      exitPrice: 48.30,
      shares: 65,
      holdingDays: 4,
      status: "CLOSED",
      ruleFollowed: true,
      notes: "빠른 모멘텀 분출 후 목표가 부근 분할 익절 완료 (+4.17R)"
    }
  ]
};

if (!fs.existsSync(TRADES_FILE)) {
  fs.writeFileSync(TRADES_FILE, JSON.stringify(DEFAULT_DATA, null, 2), 'utf-8');
}

// Built-in popular Korean & US stock dictionary for quick search & fallback
const POPULAR_STOCKS = [
  { symbol: "005930.KS", code: "005930", name: "삼성전자", market: "KR", price: 59200, prevClose: 58500, high20: 61500, low20: 56800, ma50: 60100, atr14: 1350, volRatio: 145 },
  { symbol: "000660.KS", code: "000660", name: "SK하이닉스", market: "KR", price: 196500, prevClose: 192000, high20: 198000, low20: 178000, ma50: 184500, atr14: 5400, volRatio: 210 },
  { symbol: "373220.KS", code: "373220", name: "LG에너지솔루션", market: "KR", price: 412000, prevClose: 408000, high20: 425000, low20: 385000, ma50: 396000, atr14: 11500, volRatio: 115 },
  { symbol: "207940.KS", code: "207940", name: "삼성바이오로직스", market: "KR", price: 1035000, prevClose: 1020000, high20: 1080000, low20: 980000, ma50: 995000, atr14: 22000, volRatio: 130 },
  { symbol: "005380.KS", code: "005380", name: "현대차", market: "KR", price: 221000, prevClose: 219500, high20: 242000, low20: 215000, ma50: 234000, atr14: 5200, volRatio: 95 },
  { symbol: "035420.KS", code: "035420", name: "NAVER", market: "KR", price: 176500, prevClose: 173000, high20: 178000, low20: 165000, ma50: 170200, atr14: 4100, volRatio: 185 },
  { symbol: "035720.KS", code: "035720", name: "카카오", market: "KR", price: 38200, prevClose: 37900, high20: 40500, low20: 35800, ma50: 37200, atr14: 1050, volRatio: 120 },
  { symbol: "012450.KS", code: "012450", name: "한화에어로스페이스", market: "KR", price: 389000, prevClose: 378000, high20: 392000, low20: 340000, ma50: 352000, atr14: 11200, volRatio: 235 },
  { symbol: "196170.KQ", code: "196170", name: "알테오젠", market: "KR", price: 385000, prevClose: 376000, high20: 402000, low20: 345000, ma50: 361000, atr14: 13500, volRatio: 195 },
  { symbol: "247540.KQ", code: "247540", name: "에코프로비엠", market: "KR", price: 168500, prevClose: 165000, high20: 185000, low20: 158000, ma50: 172000, atr14: 6200, volRatio: 110 },
  { symbol: "NVDA", code: "NVDA", name: "NVIDIA Corp", market: "US", price: 138.60, prevClose: 135.40, high20: 140.76, low20: 128.50, ma50: 129.80, atr14: 4.35, volRatio: 165 },
  { symbol: "AAPL", code: "AAPL", name: "Apple Inc.", market: "US", price: 228.50, prevClose: 226.80, high20: 236.48, low20: 221.00, ma50: 225.40, atr14: 3.90, volRatio: 105 },
  { symbol: "TSLA", code: "TSLA", name: "Tesla Inc.", market: "US", price: 254.20, prevClose: 249.00, high20: 265.10, low20: 215.00, ma50: 238.50, atr14: 9.80, volRatio: 220 },
  { symbol: "MSFT", code: "MSFT", name: "Microsoft Corp", market: "US", price: 418.30, prevClose: 415.00, high20: 432.00, low20: 408.00, ma50: 421.10, atr14: 6.50, volRatio: 112 },
  { symbol: "PLTR", code: "PLTR", name: "Palantir Technologies", market: "US", price: 44.85, prevClose: 43.20, high20: 45.20, low20: 38.90, ma50: 39.40, atr14: 1.65, volRatio: 245 },
  { symbol: "META", code: "META", name: "Meta Platforms Inc.", market: "US", price: 582.40, prevClose: 576.10, high20: 602.95, low20: 565.00, ma50: 568.20, atr14: 12.40, volRatio: 135 },
  { symbol: "AMZN", code: "AMZN", name: "Amazon.com Inc.", market: "US", price: 197.80, prevClose: 194.50, high20: 201.20, low20: 184.00, ma50: 188.60, atr14: 3.85, volRatio: 190 },
  { symbol: "MSTR", code: "MSTR", name: "MicroStrategy Inc.", market: "US", price: 245.00, prevClose: 236.00, high20: 260.00, low20: 195.00, ma50: 198.50, atr14: 14.20, volRatio: 280 }
];

function fetchYahooQuote(symbol) {
  return new Promise((resolve, reject) => {
    const targetUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`;
    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 5000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (!json.chart || !json.chart.result || !json.chart.result[0]) {
            return reject(new Error('No chart result'));
          }
          const result = json.chart.result[0];
          const meta = result.meta;
          const quotes = result.indicators.quote[0];
          const timestamps = result.timestamp || [];
          const closes = [];
          const highs = [];
          const lows = [];
          const opens = [];
          const volumes = [];
          const candles = [];

          for (let i = 0; i < timestamps.length; i++) {
            if (quotes.close[i] != null && quotes.high[i] != null && quotes.low[i] != null) {
              closes.push(quotes.close[i]);
              highs.push(quotes.high[i]);
              lows.push(quotes.low[i]);
              opens.push(quotes.open[i] || quotes.close[i]);
              volumes.push(quotes.volume[i] || 0);
              candles.push({
                date: new Date(timestamps[i] * 1000).toISOString().slice(0, 10),
                open: quotes.open[i] || quotes.close[i],
                high: quotes.high[i],
                low: quotes.low[i],
                close: quotes.close[i],
                volume: quotes.volume[i] || 0
              });
            }
          }

          if (closes.length === 0) {
            return reject(new Error('Empty price data'));
          }

          const price = meta.regularMarketPrice || closes[closes.length - 1];
          const prevClose = meta.chartPreviousClose || (closes.length > 1 ? closes[closes.length - 2] : price);

          // Calculate 14-day ATR
          let trSum = 0;
          let trCount = 0;
          const startIdx = Math.max(1, closes.length - 14);
          for (let i = startIdx; i < closes.length; i++) {
            const tr = Math.max(
              highs[i] - lows[i],
              Math.abs(highs[i] - closes[i - 1]),
              Math.abs(lows[i] - closes[i - 1])
            );
            trSum += tr;
            trCount++;
          }
          const atr14 = trCount > 0 ? trSum / trCount : price * 0.025;

          // Calculate 20-day High / Low & 20-day Avg Volume
          const last20Highs = highs.slice(-20);
          const last20Lows = lows.slice(-20);
          const last20Vols = volumes.slice(-20);
          const high20 = Math.max(...last20Highs);
          const low20 = Math.min(...last20Lows);
          const avgVol20 = last20Vols.reduce((a, b) => a + b, 0) / (last20Vols.length || 1);
          const latestVol = volumes[volumes.length - 1] || avgVol20;
          const volRatio = avgVol20 > 0 ? Math.round((latestVol / avgVol20) * 100) : 100;

          // Calculate 50-day MA
          const last50Closes = closes.slice(-50);
          const ma50 = last50Closes.reduce((a, b) => a + b, 0) / (last50Closes.length || 1);

          const isKR = symbol.endsWith('.KS') || symbol.endsWith('.KQ') || meta.currency === 'KRW';
          const latestLow = lows[lows.length - 1] || price;

          resolve({
            source: 'live',
            symbol: meta.symbol || symbol,
            name: meta.shortName || meta.longName || symbol,
            market: isKR ? 'KR' : 'US',
            currency: isKR ? 'KRW' : 'USD',
            price: isKR ? Math.round(price) : Number(price.toFixed(2)),
            prevClose: isKR ? Math.round(prevClose) : Number(prevClose.toFixed(2)),
            latestLow: isKR ? Math.round(latestLow) : Number(latestLow.toFixed(2)),
            atr14: isKR ? Math.round(atr14) : Number(atr14.toFixed(2)),
            high20: isKR ? Math.round(high20) : Number(high20.toFixed(2)),
            low20: isKR ? Math.round(low20) : Number(low20.toFixed(2)),
            ma50: isKR ? Math.round(ma50) : Number(ma50.toFixed(2)),
            volRatio,
            candles: candles.slice(-30)
          });
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function getFallbackQuote(query) {
  const q = query.trim().toUpperCase();
  let match = POPULAR_STOCKS.find(
    s => s.symbol.toUpperCase() === q || s.code.toUpperCase() === q || s.name.toUpperCase().includes(q)
  );

  if (!match) {
    const isKR = /^\d{6}$/.test(q) || q.endsWith('.KS') || q.endsWith('.KQ') || /[가-힣]/.test(q);
    const basePrice = isKR ? 50000 : 100;
    const atr = isKR ? 1500 : 3.2;
    match = {
      symbol: isKR && /^\d{6}$/.test(q) ? `${q}.KS` : q,
      name: q,
      market: isKR ? 'KR' : 'US',
      price: basePrice,
      prevClose: isKR ? 49200 : 98.5,
      high20: isKR ? 52500 : 105.0,
      low20: isKR ? 46800 : 92.0,
      ma50: isKR ? 48500 : 96.0,
      atr14: atr,
      volRatio: 150
    };
  }

  // Generate 30 synthetic daily candles around match price
  const candles = [];
  const isKR = match.market === 'KR';
  let cur = match.ma50;
  const step = (match.price - match.ma50) / 28;
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    const wave = Math.sin(i * 0.45) * (match.atr14 * 0.8);
    const closeVal = i === 0 ? match.price : cur + wave;
    const openVal = closeVal - (i % 2 === 0 ? match.atr14 * 0.3 : -match.atr14 * 0.25);
    const highVal = Math.max(openVal, closeVal) + match.atr14 * 0.45;
    const lowVal = Math.min(openVal, closeVal) - match.atr14 * 0.45;
    candles.push({
      date: d,
      open: isKR ? Math.round(openVal) : Number(openVal.toFixed(2)),
      high: isKR ? Math.round(highVal) : Number(highVal.toFixed(2)),
      low: isKR ? Math.round(lowVal) : Number(lowVal.toFixed(2)),
      close: isKR ? Math.round(closeVal) : Number(closeVal.toFixed(2)),
      volume: Math.round(1000000 * (1 + (i === 0 ? match.volRatio / 100 : 0.8)))
    });
    cur += step;
  }

  const latestLow = candles[candles.length - 1].low;
  return {
    source: 'preset',
    symbol: match.symbol,
    name: match.name,
    market: match.market,
    currency: isKR ? 'KRW' : 'USD',
    price: match.price,
    prevClose: match.prevClose,
    latestLow,
    atr14: match.atr14,
    high20: match.high20,
    low20: match.low20,
    ma50: match.ma50,
    volRatio: match.volRatio,
    candles
  };
}

function normalizeSymbol(raw) {
  const q = raw.trim();
  const found = POPULAR_STOCKS.find(
    s => s.name === q || s.code.toUpperCase() === q.toUpperCase() || s.symbol.toUpperCase() === q.toUpperCase()
  );
  if (found) return found.symbol;
  if (/^\d{6}$/.test(q)) return `${q}.KS`;
  return q.toUpperCase();
}

const os = require('os');

function getLanIp() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// ==================== KB국민은행 퇴직연금 ETF 실시간 시세 & 차트 엔진 ====================
let lastNaverSyncTime = 0;
let naverSyncSource = 'catalog';
const liveChartCache = new Map(); // key: `${code}_${timeframe}_${count}` -> { ts, data }

function syncNaverEtfLivePrices() {
  return new Promise((resolve) => {
    const now = Date.now();
    if (now - lastNaverSyncTime < 60000) {
      return resolve(naverSyncSource);
    }
    const req = https.get('https://finance.naver.com/api/sise/etfItemList.nhn', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 3500
    }, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const buf = Buffer.concat(chunks);
          // Naver API returns EUC-KR or UTF-8 JSON; numbers and itemcode are ASCII
          const text = buf.toString('utf-8');
          const json = JSON.parse(text);
          const list = json?.result?.etfItemList;
          if (Array.isArray(list) && list.length > 0) {
            const byCode = new Map();
            for (const item of list) {
              if (item.itemcode) byCode.set(String(item.itemcode), item);
            }
            let updated = 0;
            for (const etf of kbCatalog.KB_PENSION_ETFS) {
              const live = byCode.get(etf.code);
              if (live) {
                if (live.nowVal) etf.price = Number(live.nowVal);
                if (live.changeRate != null) etf.changePct = Number(live.changeRate);
                if (live.threeMonthEarnRate != null) etf.ret3M = Number(live.threeMonthEarnRate);
                if (live.quant != null) etf.volume = Number(live.quant);
                if (live.marketSum != null) etf.marketCap = Number(live.marketSum); // 억원 단위
                if (live.nav != null) etf.nav = Number(live.nav);
                updated++;
              }
            }
            if (updated > 0) {
              lastNaverSyncTime = now;
              naverSyncSource = 'live-naver';
            }
          }
          resolve(naverSyncSource);
        } catch (err) {
          resolve(naverSyncSource);
        }
      });
    });
    req.on('error', () => resolve(naverSyncSource));
    req.on('timeout', () => {
      req.destroy();
      resolve(naverSyncSource);
    });
  });
}

function fetchNaverEtfChart(code, timeframe = 'day', count = 90) {
  return new Promise((resolve, reject) => {
    const cacheKey = `${code}_${timeframe}_${count}`;
    const cached = liveChartCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 120000) {
      return resolve(cached.data);
    }

    const tf = ['day', 'week', 'month'].includes(timeframe) ? timeframe : 'day';
    const targetUrl = `https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(code)}&timeframe=${tf}&count=${count}&requestType=0`;

    const req = https.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 3500
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const itemRegex = /<item\s+data="([^"]+)"\s*\/>/g;
          const candles = [];
          let match;
          while ((match = itemRegex.exec(body)) !== null) {
            const parts = match[1].split('|');
            if (parts.length >= 6) {
              const rawDate = parts[0];
              const date = rawDate.length === 8
                ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
                : rawDate;
              const open = Number(parts[1]);
              const high = Number(parts[2]);
              const low = Number(parts[3]);
              const close = Number(parts[4]);
              const volume = Number(parts[5]);
              if (close > 0) {
                candles.push({
                  date,
                  open: open > 0 ? open : close,
                  high: high > 0 ? high : close,
                  low: low > 0 ? low : close,
                  close,
                  volume: volume >= 0 ? volume : 0
                });
              }
            }
          }
          if (candles.length < 5) {
            return reject(new Error('Insufficient candle data'));
          }
          liveChartCache.set(cacheKey, { ts: Date.now(), data: candles });
          resolve(candles);
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Naver chart timeout'));
    });
  });
}

function computeCandleIndicators(candles) {
  const closes = candles.map(c => c.close);
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);

  // Moving averages per bar
  const enriched = candles.map((c, idx) => {
    const slice5 = closes.slice(Math.max(0, idx - 4), idx + 1);
    const slice20 = closes.slice(Math.max(0, idx - 19), idx + 1);
    const slice60 = closes.slice(Math.max(0, idx - 59), idx + 1);
    const ma5 = Math.round(slice5.reduce((a, b) => a + b, 0) / slice5.length);
    const ma20 = Math.round(slice20.reduce((a, b) => a + b, 0) / slice20.length);
    const ma60 = Math.round(slice60.reduce((a, b) => a + b, 0) / slice60.length);
    return { ...c, ma5, ma20, ma60 };
  });

  // 20-bar high/low, 14-bar ATR, 14-bar RSI
  const last20High = Math.max(...highs.slice(-20));
  const last20Low = Math.min(...lows.slice(-20));

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
  const rsiStart = Math.max(1, closes.length - 14);
  for (let i = rsiStart; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  const rs = losses === 0 ? 100 : gains / losses;
  const rsi14 = losses === 0 ? 70 : Number((100 - 100 / (1 + rs)).toFixed(1));

  return {
    candles: enriched,
    high20: last20High,
    low20: last20Low,
    atr14,
    rsi14,
    ma20: enriched[enriched.length - 1]?.ma20 || closes[closes.length - 1],
    ma60: enriched[enriched.length - 1]?.ma60 || closes[closes.length - 1]
  };
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  // API: KB국민은행 퇴직연금 ETF 전체 리스트 + 미니 차트 데이터 반환
  if (pathname === '/api/kb-etf/list' && req.method === 'GET') {
    const timeframe = parsedUrl.query.timeframe || 'day';
    const syncSource = await syncNaverEtfLivePrices();

    const items = kbCatalog.KB_PENSION_ETFS.map(etf => {
      const miniCandles = kbCatalog.generateSyntheticCandles(etf, timeframe, 32);
      return {
        ...etf,
        miniCandles
      };
    });

    const safeCount = items.filter(x => x.assetClass === 'SAFE').length;
    const riskCount = items.filter(x => x.assetClass === 'RISK').length;

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      source: syncSource,
      updatedAt: new Date().toISOString(),
      timeframe,
      totalCount: items.length,
      safeCount,
      riskCount,
      items
    }));
  }

  // API: KB국민은행 퇴직연금 특정 ETF 상세 캔들 차트 + 이동평균선 + 기술적 지표
  if (pathname === '/api/kb-etf/chart' && req.method === 'GET') {
    const code = String(parsedUrl.query.code || '379780').trim();
    const timeframe = parsedUrl.query.timeframe || 'day';
    const count = Math.min(180, Math.max(20, Number(parsedUrl.query.count) || 90));
    const etf = kbCatalog.KB_PENSION_ETFS.find(x => x.code === code) || {
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

    try {
      const rawCandles = await fetchNaverEtfChart(code, timeframe, count);
      const latest = rawCandles[rawCandles.length - 1];
      const prev = rawCandles.length > 1 ? rawCandles[rawCandles.length - 2] : latest;
      if (latest && latest.close > 0) {
        etf.price = latest.close;
        if (prev && prev.close > 0) {
          etf.changePct = Number((((latest.close - prev.close) / prev.close) * 100).toFixed(2));
        }
      }
      const indicators = computeCandleIndicators(rawCandles);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        source: 'live-naver',
        timeframe,
        etf,
        ...indicators
      }));
    } catch (err) {
      const fallbackCandles = kbCatalog.generateSyntheticCandles(etf, timeframe, count);
      const indicators = computeCandleIndicators(fallbackCandles);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        source: 'catalog-model',
        timeframe,
        etf,
        ...indicators
      }));
    }
  }

  // API: Get quote + ATR + 20D High/Low + 50MA
  if (pathname === '/api/quote' && req.method === 'GET') {
    const rawQuery = parsedUrl.query.symbol || '005930';
    const normalized = normalizeSymbol(rawQuery);
    try {
      const data = await fetchYahooQuote(normalized);
      // Enrich Korean name if known in dictionary
      const known = POPULAR_STOCKS.find(s => s.symbol.toUpperCase() === data.symbol.toUpperCase());
      if (known) data.name = known.name;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(data));
    } catch (e) {
      const fallback = getFallbackQuote(rawQuery);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(fallback));
    }
  }

  // API: Get popular stocks list for quick selection & scanner
  if (pathname === '/api/stocks' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify(POPULAR_STOCKS));
  }

  // API: Get LAN IP & Mobile Access URL
  if (pathname === '/api/netinfo' && req.method === 'GET') {
    const ip = getLanIp();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      ip,
      port: PORT,
      mobileUrl: `http://${ip}:${PORT}`
    }));
  }

  // API: Load trades & settings
  if (pathname === '/api/data' && req.method === 'GET') {
    try {
      const content = fs.readFileSync(TRADES_FILE, 'utf-8');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(content);
    } catch (err) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(DEFAULT_DATA));
    }
  }

  // API: Save trades & settings
  if (pathname === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        fs.writeFileSync(TRADES_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // Static files
  let filePath = pathname === '/' ? '/index.html' : (pathname === '/kb-etf' ? '/kb-etf.html' : pathname);
  const fullPath = path.join(__dirname, 'public', filePath);

  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const ext = path.extname(fullPath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
    fs.createReadStream(fullPath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  }
});

function startServer(portToTry) {
  server.listen(portToTry, '0.0.0.0', () => {
    const ip = getLanIp();
    console.log(`Server running on port ${portToTry}:`);
    console.log(` - KB국민은행 퇴직연금 ETF 차트 통합 웹앱: http://localhost:${portToTry}/kb-etf.html`);
    console.log(` - Tom Doub R-System 메인 웹앱:            http://localhost:${portToTry}`);
    console.log(` - Mobile (Wi-Fi):                         http://${ip}:${portToTry}/kb-etf.html`);
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    const nextPort = 3080;
    console.log(`Port ${PORT} is in use, starting on port ${nextPort}...`);
    server.listen(nextPort, '0.0.0.0', () => {
      const ip = getLanIp();
      console.log(`Server running on port ${nextPort}:`);
      console.log(` - KB국민은행 퇴직연금 ETF 차트 통합 웹앱: http://localhost:${nextPort}/kb-etf.html`);
      console.log(` - Mobile (Wi-Fi):                         http://${ip}:${nextPort}/kb-etf.html`);
    });
  } else {
    throw err;
  }
});

startServer(PORT);
