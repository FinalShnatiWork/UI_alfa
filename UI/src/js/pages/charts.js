import { createChart, ColorType, CrosshairMode } from 'lightweight-charts';
import { applyI18n, t } from '../lib/i18n.js';

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
  // Use Binance spot/stablecoin pairs as "FX-like" realtime quotes without API keys.
  if (s === 'EURUSD') return 'EURUSDT';
  if (s === 'GBPUSD') return 'GBPUSDT';
  if (s === 'USDJPY') return 'JPYUSDT'; // inverted vs USDJPY; still realtime, labeled as proxy
  if (s === 'AUDUSD') return 'AUDUSDT';
  if (s === 'USDCAD') return 'USDCUSDT'; // proxy; Binance doesn't provide USDCAD spot
  if (s === 'USDCHF') return 'FDUSDUSDT'; // proxy; no USDCHF spot
  // Metals proxies (tokenized / commodity-linked where available)
  if (s === 'XAUUSD') return 'XAUTUSDT'; // Tether Gold, not spot XAUUSD
  return s;
}

const CATEGORY_CONFIG = {
  forex: {
    instruments: [
      { id: 'EURUSD', title: 'EURUSD', decimals: 5 },
      { id: 'GBPUSD', title: 'GBPUSD', decimals: 5 },
      { id: 'USDJPY', title: 'USDJPY', decimals: 3 },
      { id: 'AUDUSD', title: 'AUDUSD', decimals: 5 },
      { id: 'USDCAD', title: 'USDCAD', decimals: 5 },
      { id: 'USDCHF', title: 'USDCHF', decimals: 5 },
    ],
    source: 'binance',
  },
  metals: {
    instruments: [
      { id: 'XAUUSD', title: 'XAUUSD (via XAUTUSDT)', decimals: 2, source: 'binance' },
      { id: 'XAGUSD', title: 'XAGUSD (demo)', decimals: 2, source: 'synthetic_live' },
      { id: 'XPTUSD', title: 'XPTUSD (demo)', decimals: 2, source: 'synthetic_live' },
    ],
    source: 'binance',
  },
  crypto: {
    instruments: [
      { id: 'BTCUSD', title: 'BTCUSD', decimals: 2 },
      { id: 'ETHUSD', title: 'ETHUSD', decimals: 2 },
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
  if (!bidAskEl || !instr || close == null) return;
  const d = instr.decimals;
  const mid = close;
  const spread = mid * 0.00015;
  bidAskEl.textContent = t('charts.bidAskFormatted', {
    bid: (mid - spread).toFixed(d),
    ask: (mid + spread).toFixed(d),
  });
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
}

document.addEventListener('DOMContentLoaded', () => {
  applyI18n();

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

  renderInstrumentButtons();
  loadChart();
});
