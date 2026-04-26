import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import { applyI18n, t } from '../lib/i18n.js';
import { apiGet, apiPostJson } from '../lib/api.js';
import { showToast } from '../lib/toast.js';

/** Dev: vite proxy `/binance` → Binance REST. WebSocket always uses stream.binance.com. */
const BINANCE_PREFIX = import.meta.env.DEV ? '/binance' : 'https://api.binance.com';
const BINANCE_WS = 'wss://stream.binance.com:9443/ws';

const STOCK_POLL_MS = 15_000;
const SYNTH_TICK_MS = 1000;
const FETCH_TIMEOUT_MS = 10_000;

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function mapToBinanceSymbol(symbol) {
  const s = String(symbol || '').trim().toUpperCase();
  if (s === 'BTCUSD') return 'BTCUSDT';
  if (s === 'ETHUSD') return 'ETHUSDT';
  if (s === 'SOLUSD') return 'SOLUSDT';
  if (s === 'XRPUSD') return 'XRPUSDT';
  // Use Binance spot/stablecoin pairs as "FX-like" realtime quotes without API keys.
  if (s === 'EURUSD') return 'EURUSDT';
  if (s === 'GBPUSD') return 'GBPUSDT';
  if (s === 'NZDUSD') return 'NZDUSDT';
  if (s === 'USDJPY') return 'JPYUSDT'; // inverted vs USDJPY; still realtime, labeled as proxy
  if (s === 'USDCAD') return 'USDCUSDT'; // proxy; Binance doesn't provide USDCAD spot
  // Metals proxies (tokenized / commodity-linked where available)
  if (s === 'XAUUSD') return 'XAUTUSDT'; // Tether Gold, not spot XAUUSD
  if (s === 'XAGUSD') return 'XAGUSDT';
  return s;
}

const CATEGORY_CONFIG = {
  forex: {
    instruments: [
      { id: 'EURUSD', title: 'EURUSD', decimals: 5 },
      { id: 'GBPUSD', title: 'GBPUSD', decimals: 5 },
      { id: 'USDCAD', title: 'USDCAD', decimals: 5 },
      { id: 'EURNOK', title: 'EURNOK', decimals: 5 },
      { id: 'GBPJPY', title: 'GBPJPY', decimals: 3 },
      { id: 'USDJPY', title: 'USDJPY', decimals: 3 },
      { id: 'NZDUSD', title: 'NZDUSD', decimals: 5 },
      { id: 'CADJPY', title: 'CADJPY', decimals: 3 },
    ],
    source: 'yahoo',
  },
  metals: {
    instruments: [
      { id: 'XAGUSD', title: 'XAGUSD', decimals: 2, source: 'yahoo' },
      { id: 'XAUUSD', title: 'XAUUSD', decimals: 2, source: 'yahoo' },
    ],
    source: 'yahoo',
  },
  crypto: {
    instruments: [
      { id: 'SOLUSD', title: 'SOLUSD', decimals: 2 },
      { id: 'BTCUSD', title: 'BTCUSD', decimals: 2 },
      { id: 'ETHUSD', title: 'ETHUSD', decimals: 2 },
      { id: 'XRPUSD', title: 'XRPUSD', decimals: 4 },
    ],
    source: 'binance',
  },
};

const INTERVAL_BINANCE = {
  '1m': '1m',
  '5m': '5m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
  '1M': '1M',
};

const INTERVAL_SECONDS = {
  '1m': 60,
  '5m': 300,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
  '1w': 604800,
  '1M': 2592000,
};

let chart;
let series;

let liveGen = 0;
let binanceWs = null;
let stockPollTimer = null;
let synthTickTimer = null;

function stopLiveUpdates() {
  if (binanceWs) {
    try {
      binanceWs.close();
    } catch {
      /* ignore */
    }
    binanceWs = null;
  }
  if (stockPollTimer != null) {
    clearInterval(stockPollTimer);
    stockPollTimer = null;
  }
  if (synthTickTimer != null) {
    clearInterval(synthTickTimer);
    synthTickTimer = null;
  }
}

function updateBidAskRow(bidAskEl, instr, close) {
  if (!instr || close == null) return;
  const d = instr.decimals;
  const mid = close;
  const spread = mid * 0.00015;
  const bid = mid - spread;
  const ask = mid + spread;

  if (bidAskEl) {
    bidAskEl.textContent = t('charts.bidAskFormatted', {
      bid: bid.toFixed(d),
      ask: ask.toFixed(d),
    });
  }

  // Update trading panel labels if they exist
  const livePriceValue = document.getElementById('livePriceValue');
  if (livePriceValue) {
    livePriceValue.textContent = mid > 100 ? mid.toFixed(2) : mid.toFixed(d);
    // Simple color logic based on previous state if we wanted to add it
  }
}

function connectBinanceKlineStream(symbol, intervalKey, gen, instr, bidAskEl, statusEl) {
  const mapped = mapToBinanceSymbol(symbol);
  const interval = INTERVAL_BINANCE[intervalKey];
  if (!interval) return;

  const streamPath = `${mapped.toLowerCase()}@kline_${interval}`;
  const url = `${BINANCE_WS}/${streamPath}`;

  const ws = new WebSocket(url);
  binanceWs = ws;

  ws.onmessage = (ev) => {
    if (gen !== liveGen || !series) return;
    try {
      const msg = JSON.parse(ev.data);
      const k = msg.k;
      if (!k) return;
      const bar = {
        time: Math.floor(Number(k.t) / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
      };
      series.update(bar);
      updateBidAskRow(bidAskEl, instr, bar.close);
    } catch {
      /* ignore malformed */
    }
  };

  ws.onopen = () => {
    if (gen === liveGen && statusEl) {
      statusEl.textContent = t('charts.liveBinance');
    }
  };

  ws.onclose = () => {
    if (gen !== liveGen || binanceWs !== ws) return;
    binanceWs = null;
    setTimeout(() => {
      if (gen !== liveGen) return;
      connectBinanceKlineStream(symbol, intervalKey, gen, instr, bidAskEl, statusEl);
    }, 2500);
  };
}

function startSyntheticStreaming(symbol, intervalKey, initialBar, gen, instr, bidAskEl, statusEl) {
  const sec = INTERVAL_SECONDS[intervalKey] ?? 3600;
  const seed = Array.from(symbol).reduce((s, c) => (s + c.charCodeAt(0)) | 0, 7);
  const rand = mulberry32(seed);
  let cur = initialBar;

  synthTickTimer = window.setInterval(() => {
    if (gen !== liveGen || !series) return;
    const now = Math.floor(Date.now() / 1000);
    const bucket = Math.floor(now / sec) * sec;

    // Get last bar (we keep our own last in closure)
    const drift = (rand() - 0.5) * 0.0025; // small drift per second
    const lastClose = cur.close;
    const nextClose = Math.max(0.0001, lastClose * (1 + drift));

    if (bucket !== cur.time) {
      // start new candle
      cur = {
        time: bucket,
        open: lastClose,
        high: Math.max(lastClose, nextClose),
        low: Math.min(lastClose, nextClose),
        close: nextClose,
      };
    } else {
      cur = {
        ...cur,
        high: Math.max(cur.high, nextClose),
        low: Math.min(cur.low, nextClose),
        close: nextClose,
      };
    }

    series.update(cur);
    updateBidAskRow(bidAskEl, instr, cur.close);
    if (statusEl) statusEl.textContent = t('charts.almostLive');
  }, SYNTH_TICK_MS);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function syntheticCandles(symbol, intervalKey, count = 400) {
  const sec = INTERVAL_SECONDS[intervalKey] ?? 3600;
  const seed = Array.from(symbol).reduce((s, c) => (s + c.charCodeAt(0)) | 0, 7);
  const rand = mulberry32(seed);
  let price = 50 + rand() * 200 + symbol.length * 3;
  const now = Math.floor(Date.now() / 1000);
  const nowBucket = Math.floor(now / sec) * sec;
  const out = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const time = nowBucket - i * sec;
    const o = price;
    const c = o * (1 + (rand() - 0.47) * 0.028);
    const h = Math.max(o, c) * (1 + rand() * 0.006);
    const l = Math.min(o, c) * (1 - rand() * 0.006);
    out.push({
      time,
      open: o,
      high: h,
      low: l,
      close: c,
    });
    price = c;
  }
  return out;
}

async function fetchBinanceKlines(symbol, intervalKey) {
  const mapped = mapToBinanceSymbol(symbol);
  const interval = INTERVAL_BINANCE[intervalKey];
  if (!interval) throw new Error('bad interval');
  const url = `${BINANCE_PREFIX}/api/v3/klines?symbol=${encodeURIComponent(mapped)}&interval=${interval}&limit=500`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const tx = await res.text().catch(() => '');
    throw new Error(`${res.status} ${tx}`);
  }
  const raw = await res.json();
  return raw.map((k) => ({
    time: Math.floor(Number(k[0]) / 1000),
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  }));
}

async function fetchYahooCandles(symbol, intervalKey, category) {
  const url = `/api/market/${category}/candles?symbol=${encodeURIComponent(symbol)}&interval=${intervalKey}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Yahoo backend error: ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Invalid candle data');
  return data.map(d => ({
    time: d.time,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close
  })).sort((a, b) => a.time - b.time);
}

function isLightTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function chartColors() {
  const light = isLightTheme();
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: light ? '#475569' : '#94a3b8',
      attributionLogo: false,
    },
    grid: {
      vertLines: { color: light ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)' },
      horzLines: { color: light ? 'rgba(15,23,42,0.08)' : 'rgba(255,255,255,0.06)' },
    },
    crosshair: { mode: CrosshairMode.Normal },
    rightPriceScale: { borderColor: light ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)' },
    timeScale: { borderColor: light ? 'rgba(15,23,42,0.12)' : 'rgba(255,255,255,0.12)' },
  };
}

function ensureChart(mountEl) {
  if (chart) {
    chart.applyOptions({
      width: mountEl.clientWidth,
      ...chartColors(),
    });
    return;
  }
  chart = createChart(mountEl, {
    width: mountEl.clientWidth,
    height: mountEl.clientHeight || 396,
    ...chartColors(),
  });
  series = chart.addCandlestickSeries({
    upColor: '#22c55e',
    downColor: '#ef4444',
    borderVisible: false,
    wickUpColor: '#22c55e',
    wickDownColor: '#ef4444',
  });
  window.addEventListener('resize', () => {
    if (chart && mountEl) {
      chart.applyOptions({ width: mountEl.clientWidth });
    }
  });
  const mo = new MutationObserver(() => {
    if (!chart) return;
    chart.applyOptions(chartColors());
  });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

function applyTimeScaleFormatting() {
  if (!chart) return;
  const sec = INTERVAL_SECONDS[state.interval] ?? 3600;
  const showTime = sec < 86400;
  const showSeconds = sec <= 60;
  const locale = document.documentElement.getAttribute('lang') || navigator.language || 'en';

  chart.applyOptions({
    localization: { locale },
    timeScale: {
      ...chartColors().timeScale,
      timeVisible: showTime,
      secondsVisible: showSeconds,
      tickMarkFormatter: (time) => {
        const ms = Number(time) * 1000;
        if (!Number.isFinite(ms)) return '';
        const d = new Date(ms);
        if (showTime) {
          return new Intl.DateTimeFormat(locale, {
            hour: '2-digit',
            minute: '2-digit',
          }).format(d);
        }
        return new Intl.DateTimeFormat(locale, {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
      },
    },
  });
}

function setActiveGroup(selector, activeEl) {
  document.querySelectorAll(selector).forEach((el) => {
    const on = el === activeEl;
    el.classList.toggle('btn-primary', on);
    el.classList.toggle('btn-outline-dark', !on);
    el.classList.toggle('active', on);
  });
}

const state = {
  category: 'forex',
  instrumentId: 'EURUSD',
  interval: '1h',
};

function renderInstrumentButtons() {
  const row = document.getElementById('chartsInstrumentRow');
  if (!row) return;
  const cfg = CATEGORY_CONFIG[state.category];
  if (!cfg.instruments.some((i) => i.id === state.instrumentId)) {
    state.instrumentId = cfg.instruments[0].id;
  }
  row.replaceChildren();
  cfg.instruments.forEach((instr) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn charts-instr btn-outline-dark';
    btn.dataset.symbol = instr.id;
    btn.textContent = instr.title;
    if (instr.id === state.instrumentId) {
      btn.classList.remove('btn-outline-dark');
      btn.classList.add('btn-primary', 'active');
    }
    btn.addEventListener('click', () => {
      state.instrumentId = instr.id;
      setActiveGroup('.charts-instr', btn);
      loadChart();
    });
    row.appendChild(btn);
  });
}

async function loadChart() {
  const mount = document.getElementById('chartMount');
  const status = document.getElementById('chartsStatus');
  const symLabel = document.getElementById('chartSymbolLabel');
  const bidAsk = document.getElementById('chartBidAsk');
  if (!mount || !series) return;

  stopLiveUpdates();
  const gen = ++liveGen;

  const cfg = CATEGORY_CONFIG[state.category];
  const instr = cfg.instruments.find((i) => i.id === state.instrumentId) ?? cfg.instruments[0];
  const source = instr.source ?? cfg.source;
  symLabel.textContent = instr.title;
  status.textContent = t('charts.loading');
  applyTimeScaleFormatting();

  try {
    let data;
    if (source === 'binance') {
      try {
        data = await fetchBinanceKlines(instr.id, state.interval);
      } catch (e) {
        if (gen !== liveGen) return;
        data = syntheticCandles(instr.id, state.interval);
        series.setData(data);
        chart.timeScale().fitContent();
        const last = data[data.length - 1];
        if (last) updateBidAskRow(bidAsk, instr, last.close);
        status.textContent = t('charts.binanceSlow');
        return;
      }
      if (gen !== liveGen) return;
      series.setData(data);
      chart.timeScale().fitContent();
      const last = data[data.length - 1];
      if (last) {
        updateBidAskRow(bidAsk, instr, last.close);
      }
      connectBinanceKlineStream(instr.id, state.interval, gen, instr, bidAsk, status);
    } else if (source === 'yahoo') {
      try {
        data = await fetchYahooCandles(instr.id, state.interval, state.category);
      } catch (e) {
        if (gen !== liveGen) return;
        data = syntheticCandles(instr.id, state.interval);
        series.setData(data);
        chart.timeScale().fitContent();
        const last = data[data.length - 1];
        if (last) updateBidAskRow(bidAsk, instr, last.close);
        status.textContent = t('charts.demoData');
        return;
      }
      if (gen !== liveGen) return;
      series.setData(data);
      chart.timeScale().fitContent();
      const last = data[data.length - 1];
      if (last) updateBidAskRow(bidAsk, instr, last.close);
      status.textContent = t('charts.liveYahoo') || 'Live — Yahoo Finance';

      // Start polling for live price update
      let currentBar = last ? { ...last } : null;
      stockPollTimer = setInterval(async () => {
        if (gen !== liveGen) return;
        try {
          const pd = await apiGet(`/api/market/price/${encodeURIComponent(instr.id)}`);
          if (pd && pd.price) {
            const price = Number(pd.price);
            updateBidAskRow(bidAsk, instr, price);
            
            const now = Math.floor(Date.now() / 1000);
            const sec = INTERVAL_SECONDS[state.interval] ?? 3600;
            const bucket = Math.floor(now / sec) * sec;

            if (!currentBar || bucket > currentBar.time) {
              // New candle
              currentBar = {
                time: bucket,
                open: price,
                high: price,
                low: price,
                close: price
              };
            } else {
              // Update existing candle
              currentBar.high = Math.max(currentBar.high, price);
              currentBar.low = Math.min(currentBar.low, price);
              currentBar.close = price;
            }
            series.update(currentBar);
          }
        } catch { /* ignore */ }
      }, 2000); // 2 seconds for faster feel
    } else if (source === 'synthetic_live') {
      data = syntheticCandles(instr.id, state.interval);
      if (gen !== liveGen) return;
      series.setData(data);
      chart.timeScale().fitContent();
      const last = data[data.length - 1];
      if (last) updateBidAskRow(bidAsk, instr, last.close);
      status.textContent = t('charts.almostLive');
      // stream updates every second
      const initialBar = last ?? { time: Math.floor(Date.now() / 1000), open: 1, high: 1, low: 1, close: 1 };
      startSyntheticStreaming(instr.id, state.interval, initialBar, gen, instr, bidAsk, status);
    } else {
      data = syntheticCandles(instr.id, state.interval);
      if (gen !== liveGen) return;
      series.setData(data);
      chart.timeScale().fitContent();
      const last = data[data.length - 1];
      if (last) updateBidAskRow(bidAsk, instr, last.close);
      status.textContent = t('charts.demoData');
    }
  } catch {
    if (gen !== liveGen) return;
    status.textContent = t('charts.errorLoad');
    series.setData([]);
  }
  refreshPortfolio();
}

async function refreshPortfolio() {
  const balEl = document.getElementById('tradingBalance');
  const qtyEl = document.getElementById('tradingPositionQty');
  const sym = state.instrumentId;

  try {
    const ov = await apiGet('/api/broker/overview');
    if (balEl) balEl.textContent = '$' + Number(ov?.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 });
  } catch { /* ignore */ }

  try {
    const pos = await apiGet('/api/broker/positions');
    const list = Array.isArray(pos) ? pos : [];
    const p = list.find((x) => String(x?.symbolCode || '').toUpperCase() === String(sym || '').toUpperCase());
    if (qtyEl) qtyEl.textContent = p ? Number(p.quantity).toFixed(2) : '0.00';
  } catch { /* ignore */ }
}

async function placeOrder(side) {
  const symbolCode = state.instrumentId;
  const volInput = document.getElementById('vol');
  const quantity = volInput ? Number(volInput.value) : 0;
  
  const activeTypeBtn = document.querySelector('.order-type-btn.btn-primary');
  const orderType = activeTypeBtn?.dataset.orderType?.toUpperCase() || 'MARKET';
  const entryPriceInput = document.getElementById('entryPriceInput');
  const entryPrice = entryPriceInput ? Number(entryPriceInput.value) : null;

  if (!symbolCode || !quantity || quantity <= 0) {
    showToast(t('trading.errBadOrder'), { variant: 'warning' });
    return;
  }

  if (orderType !== 'MARKET' && (!entryPrice || entryPrice <= 0)) {
    showToast(t('trading.errEntryPriceRequired'), { variant: 'warning' });
    return;
  }

  const btn = document.getElementById(side.toLowerCase() + 'Btn');
  if (btn) btn.disabled = true;

  try {
    const payload = { side, symbolCode, quantity, orderType };
    if (orderType === 'LIMIT') payload.limitPrice = entryPrice;
    if (orderType === 'STOP') payload.stopPrice = entryPrice;

    const res = await apiPostJson('/api/broker/orders', payload);
    const data = await res.json();

    if (res.ok) {
      if (data.status === 'NEW') {
        showToast(t('trading.orderPlaced', { side, symbol: symbolCode }), { variant: 'success' });
      } else {
        showToast(t('trading.orderFilled', { 
          side, 
          symbol: symbolCode, 
          price: data.fillPrice, 
          balance: Number(data.newBalance).toFixed(2) 
        }), { variant: 'success' });
      }
      refreshPortfolio();
      // Wait a bit then refresh positions list
      setTimeout(() => {
        const refreshPos = document.getElementById('refreshPositionsBtn');
        if (refreshPos) refreshPos.click();
      }, 800);
    } else {
      const errCode = data?.error || 'unknown';
      showToast(t('trading.errOrderFailed') + ': ' + errCode, { variant: 'error' });
    }
  } catch (e) {
    showToast(t('trading.errOrderFailed'), { variant: 'error' });
  } finally {
    if (btn) btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

  // --- Inline Open Positions Panel (same behavior as Trading) ---
  const inlinePosBody = document.getElementById('inlinePosBody');
  const refreshPositionsBtn = document.getElementById('refreshPositionsBtn');

  function fmtP(n) {
    const v = Number(n ?? 0);
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v) > 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
  }

  async function loadInlinePositions() {
    if (!inlinePosBody) return;
    try {
      const rows = await apiGet('/api/broker/positions');
      const list = Array.isArray(rows) ? rows : [];
      const active = list.filter((p) => Number(p.quantity ?? 0) !== 0);

      if (!active.length) {
        inlinePosBody.innerHTML =
          `<tr><td colspan="6" style="padding: 1.2rem; text-align: center; color: var(--text-secondary); font-size: 0.85rem;">${t('trading.noPositions')}</td></tr>`;
        return;
      }

      const rows2 = await Promise.all(
        active.map(async (p) => {
          const sym = p.symbolCode ?? '';
          const avg = Number(p.avgPrice ?? 0);
          const qty = Number(p.quantity ?? 0);
          let curPrice = null;
          try {
            const pd = await apiGet(`/api/market/price/${encodeURIComponent(sym)}`);
            curPrice = pd?.price != null ? Number(pd.price) : null;
          } catch {
            /* ignore */
          }

          const curHtml = curPrice != null ? fmtP(curPrice) : '—';
          let pnlHtml = '—';
          if (curPrice != null) {
            const pnl = (curPrice - avg) * qty;
            const cls = pnl >= 0 ? 'color:#10b981' : 'color:#ef4444';
            const sign = pnl >= 0 ? '+' : '';
            pnlHtml = `<span style="font-weight:600;${cls}">${sign}$${fmtP(Math.abs(pnl))}</span>`;
          }

          return `<tr style="border-top: 1px solid var(--border-color, rgba(255,255,255,0.08));">
            <td style="font-weight: 600;">${sym}</td>
            <td class="num">${fmtP(qty)}</td>
            <td class="num" style="color: var(--text-secondary);">${fmtP(avg)}</td>
            <td class="num">${curHtml}</td>
            <td class="num">${pnlHtml}</td>
            <td class="center">
              <button class="btn btn-danger inline-close-pos" data-symbol="${sym}" data-qty="${qty}">✕</button>
            </td>
          </tr>`;
        })
      );

      inlinePosBody.innerHTML = rows2.join('');

      inlinePosBody.querySelectorAll('.inline-close-pos').forEach((btn) => {
        btn.addEventListener('click', async (e) => {
          const sym = e.currentTarget.getAttribute('data-symbol');
          const qty = parseFloat(e.currentTarget.getAttribute('data-qty'));
          if (!confirm(t('confirm.closePosition', { symbol: sym }))) return;

          e.currentTarget.disabled = true;
          e.currentTarget.textContent = t('common.closing');
          try {
            const res = await apiPostJson('/api/broker/orders', {
              side: 'SELL',
              symbolCode: sym,
              quantity: qty,
              orderType: 'MARKET',
            });
            const data = await res.json();
            if (data.ok) {
              showToast(t('alerts.closeOk', { symbol: sym }) + ` @ ${data.fillPrice}`, { variant: 'success', duration: 3000 });
              setTimeout(loadInlinePositions, 500);
            } else {
              showToast(t('alerts.closeFail'), { variant: 'error' });
              e.currentTarget.disabled = false;
              e.currentTarget.textContent = '✕';
            }
          } catch {
            showToast(t('alerts.closeFail'), { variant: 'error' });
            e.currentTarget.disabled = false;
            e.currentTarget.textContent = '✕';
          }
        });
      });
    } catch {
      inlinePosBody.innerHTML =
        `<tr><td colspan="6" style="padding:1rem; text-align:center; color:var(--text-secondary);">${t('trading.loadFail')}</td></tr>`;
    }
  }

  if (refreshPositionsBtn) refreshPositionsBtn.addEventListener('click', loadInlinePositions);
  loadInlinePositions();
  setInterval(loadInlinePositions, 8000);

  const mount = document.getElementById('chartMount');
  if (mount) {
    ensureChart(mount);
  }

  window.addEventListener('pagehide', stopLiveUpdates);

  document.querySelectorAll('.charts-cat').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.category = btn.dataset.category ?? 'crypto';
      const cfg = CATEGORY_CONFIG[state.category];
      state.instrumentId = cfg.instruments[0].id;
      setActiveGroup('.charts-cat', btn);
      renderInstrumentButtons();
      loadChart();
    });
  });

  document.querySelectorAll('.charts-tf').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.interval = btn.dataset.interval ?? '1h';
      setActiveGroup('.charts-tf', btn);
      loadChart();
    });
  });

  // --- Trading Panel Logic ---
  const volInput = document.getElementById('vol');
  const volPlus = document.getElementById('volPlus');
  const volMinus = document.getElementById('volMinus');
  if (volPlus && volInput) {
    volPlus.addEventListener('click', () => {
      const v = parseFloat(volInput.value) || 0;
      volInput.value = (v + 0.1).toFixed(2);
    });
  }
  if (volMinus && volInput) {
    volMinus.addEventListener('click', () => {
      const v = parseFloat(volInput.value) || 0.1;
      if (v > 0.1) volInput.value = (v - 0.1).toFixed(2);
    });
  }

  const orderTypeBtns = document.querySelectorAll('.order-type-btn');
  const entryPriceGroup = document.getElementById('entryPriceGroup');
  orderTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      orderTypeBtns.forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-outline-dark');
      });
      btn.classList.add('btn-primary');
      btn.classList.remove('btn-outline-dark');
      
      const type = btn.dataset.orderType;
      if (entryPriceGroup) {
        entryPriceGroup.style.display = (type === 'market') ? 'none' : 'block';
      }
    });
  });

  const buyBtn = document.getElementById('buyBtn');
  const sellBtn = document.getElementById('sellBtn');
  if (buyBtn) buyBtn.addEventListener('click', () => placeOrder('BUY'));
  if (sellBtn) sellBtn.addEventListener('click', () => placeOrder('SELL'));

  renderInstrumentButtons();
  loadChart();
  refreshPortfolio();
  setInterval(refreshPortfolio, 10000);
});
