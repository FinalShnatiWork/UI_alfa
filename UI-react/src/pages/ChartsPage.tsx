import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createChart, ColorType, CrosshairMode,
  CandlestickSeries, HistogramSeries,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from 'lightweight-charts';
import { apiPostJson, getContractSize } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { LoanOfferModal, type LoanOfferDetails } from '@/components/LoanOfferModal';
import { usePositions, useBrokerOverview, useInvalidateAfterTrade, useLivePrices, usePendingOrders, useCancelOrder } from '@/hooks/useApi';

import type { PlaceOrderResponse, ClosePositionResponse } from '@/types/api';

// ── Constants ────────────────────────────────────────────────────────────────

const BYBIT_KLINES_URL = 'https://api.bybit.com/v5/market/kline';
const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear';
const STOCK_POLL_MS = 5000;
const FETCH_TIMEOUT_MS = 10_000;

type Category = 'forex' | 'metals' | 'crypto';
type OrderType = 'MARKET' | 'LIMIT';
type Interval = '1m' | '5m' | '1h' | '4h' | '1d' | '1w' | '1M';

interface Instrument { id: string; title: string; decimals: number; source?: string }
interface Candle { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume?: number }

const CATEGORY_CONFIG: Record<Category, { instruments: Instrument[]; source: string }> = {
  forex: {
    source: 'yahoo',
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
  },
  metals: {
    source: 'yahoo',
    instruments: [
      { id: 'XAGUSD', title: 'XAGUSD', decimals: 2 },
      { id: 'XAUUSD', title: 'XAUUSD', decimals: 2 },
    ],
  },
  crypto: {
    source: 'bybit',
    instruments: [
      { id: 'SOLUSD', title: 'SOLUSD', decimals: 2 },
      { id: 'BTCUSD', title: 'BTCUSD', decimals: 2 },
      { id: 'ETHUSD', title: 'ETHUSD', decimals: 2 },
      { id: 'XRPUSD', title: 'XRPUSD', decimals: 4 },
    ],
  },
};

const INTERVALS: Interval[] = ['1m', '5m', '1h', '4h', '1d', '1w', '1M'];

const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60, '5m': 300, '1h': 3600, '4h': 14400,
  '1d': 86400, '1w': 604800, '1M': 2592000,
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function mapToBybitSymbol(s: string): string {
  const u = s.toUpperCase();
  const MAP: Record<string, string> = {
    BTCUSD: 'BTCUSDT', ETHUSD: 'ETHUSDT', SOLUSD: 'SOLUSDT', XRPUSD: 'XRPUSDT',
  };
  return MAP[u] ?? (u.endsWith('USD') ? u + 'T' : u);
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function symbolAnnualVol(s: string): number {
  if (s.startsWith('BTC') || s.startsWith('ETH')) return 0.85;
  if (s.startsWith('SOL') || s.startsWith('XRP')) return 1.00;
  if (s.startsWith('XAG')) return 0.28;
  if (s.startsWith('XAU')) return 0.16;
  if (s.endsWith('JPY')) return 0.08;
  return 0.07;
}

function defaultPrice(s: string): number {
  if (s.endsWith('JPY')) return 158.0;
  if (s.startsWith('CADJPY')) return 113.0;
  if (s.startsWith('GBPJPY')) return 210.0;
  if (s.startsWith('XAU')) return 4660.0;
  if (s.startsWith('XAG')) return 83.0;
  if (s.startsWith('BTC')) return 103000.0;
  if (s.startsWith('ETH')) return 2400.0;
  if (s.startsWith('SOL')) return 170.0;
  if (s.startsWith('XRP')) return 2.40;
  if (s.startsWith('GBPUSD')) return 1.34;
  if (s.startsWith('USDCAD')) return 1.37;
  if (s.startsWith('NZDUSD')) return 0.60;
  if (s.startsWith('EURNOK')) return 10.80;
  return 1.17;
}

function syntheticCandles(symbol: string, intervalKey: Interval, count = 300, basePrice?: number | null): Candle[] {
  const sec = INTERVAL_SECONDS[intervalKey] ?? 3600;
  const S = symbol.toUpperCase();
  const anchor = (basePrice && basePrice > 0) ? basePrice : defaultPrice(S);
  const annualVol = symbolAnnualVol(S);
  const barsPerYear = (365.25 * 24 * 3600) / sec;
  const sigmaPerBar = annualVol / Math.sqrt(barsPerYear);
  const now = Math.floor(Date.now() / 1000);
  const endBucket = Math.floor(now / sec) * sec;
  const symHash = Array.from(S).reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);
  const periodKey = (Math.floor(endBucket / (sec * count)) & 0x7fffffff);
  const rand = mulberry32(((symHash ^ periodKey) + 0x9e3779b9) >>> 0);
  const rawLog = [0];
  let trendMu = 0, trendLeft = 0;
  for (let i = 1; i < count; i++) {
    if (trendLeft <= 0) {
      const pull = -rawLog[i - 1] * 0.03;
      trendMu = pull + (rand() - 0.5) * sigmaPerBar * 0.6;
      trendLeft = Math.floor(6 + rand() * 20);
    }
    trendLeft--;
    const u1 = Math.max(1e-10, rand()), u2 = rand();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    rawLog.push(rawLog[i - 1] + trendMu + sigmaPerBar * z);
  }
  const logAnchor = Math.log(anchor);
  const logOffset = logAnchor - rawLog[rawLog.length - 1];
  const prices = rawLog.map(l => Math.exp(l + logOffset));
  const out: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const time = (endBucket - (count - 1 - i) * sec) as UTCTimestamp;
    const close = prices[i];
    const open = i === 0 ? close : prices[i - 1] * (1 + (rand() - 0.5) * sigmaPerBar * 0.1);
    const body = Math.abs(close - open);
    const avgBody = close * sigmaPerBar * 0.5;
    const wickBase = Math.max(body, avgBody) * (0.15 + rand() * 0.55);
    const longWick = rand() < 0.06 ? wickBase * (1.5 + rand() * 2.0) : 0;
    const upper = wickBase + (close > open ? 0 : longWick);
    const lower = wickBase + (close < open ? 0 : longWick);
    const high = Math.max(open, close) + upper;
    const low = Math.max(0.000001, Math.min(open, close) - lower);
    const volume = Math.round((0.4 + rand() * 1.2 + (body / (avgBody || 1)) * 0.4) * 1000);
    out.push({ time, open, high, low, close, volume });
  }
  return out;
}

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function fetchBybitKlines(symbol: string, intervalKey: Interval): Promise<Candle[]> {
  const mapped = mapToBybitSymbol(symbol);
  const ivMap: Record<Interval, string> = {
    '1m': '1', '5m': '5', '1h': '60', '4h': '240',
    '1d': 'D', '1w': 'W', '1M': 'M',
  };
  const iv = ivMap[intervalKey] || '60';
  const url = `${BYBIT_KLINES_URL}?category=linear&symbol=${encodeURIComponent(mapped)}&interval=${iv}&limit=500`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Bybit ${res.status}`);
  const data = await res.json();
  const list = data.result?.list;
  if (!Array.isArray(list)) throw new Error('Invalid Bybit data');
  return list.map(k => ({
    time: Math.floor(Number(k[0]) / 1000) as UTCTimestamp,
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
  })).sort((a, b) => a.time - b.time);
}

async function fetchYahooCandles(symbol: string, intervalKey: Interval, category: Category): Promise<Candle[]> {
  const url = `/api/market/${category}/candles?symbol=${encodeURIComponent(symbol)}&interval=${intervalKey}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const data = await res.json() as Candle[];
  if (!Array.isArray(data) || !data.length) throw new Error('no data');
  return data.map(d => ({ time: d.time as UTCTimestamp, open: d.open, high: d.high, low: d.low, close: d.close }))
    .sort((a, b) => a.time - b.time);
}

function isLightTheme(): boolean {
  return document.documentElement.getAttribute('data-theme') === 'light';
}

function chartColors() {
  const light = isLightTheme();
  return {
    layout: {
      background: { type: ColorType.Solid, color: 'transparent' },
      textColor: light ? '#475569' : '#94a3b8',
      attributionLogo: false,
      fontFamily: "'Inter', 'Segoe UI', sans-serif",
      fontSize: 12,
    },
    grid: {
      vertLines: { color: light ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.04)' },
      horzLines: { color: light ? 'rgba(15,23,42,0.06)' : 'rgba(255,255,255,0.04)' },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: light ? 'rgba(15,23,42,0.35)' : 'rgba(234,179,8,0.5)', labelBackgroundColor: light ? '#1e293b' : '#ca8a04' },
      horzLine: { color: light ? 'rgba(15,23,42,0.35)' : 'rgba(234,179,8,0.5)', labelBackgroundColor: light ? '#1e293b' : '#ca8a04' },
    },
    rightPriceScale: { borderColor: light ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)', scaleMargins: { top: 0.08, bottom: 0.22 }, autoScale: true },
    timeScale: { borderColor: light ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.08)', barSpacing: 8, minBarSpacing: 2, fixLeftEdge: false, fixRightEdge: false, rightOffset: 15 },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { axisPressedMouseMove: { time: true, price: true }, axisDoubleClickReset: { time: true, price: true }, mouseWheel: true, pinch: true },
  };
}

function fmtP(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  // Fixed decimals within each band — variable maxFractionDigits made the
  // positions table under the chart jump on every live tick.
  const d = abs > 1000 ? 2 : abs >= 10 ? 4 : 5;
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtMoney2(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Charts Page rendering real-time interactive asset charts (via TradingView Lightweight Charts).
 * Provides trading forms for placing MARKET and LIMIT orders, selecting quantity lot volume,
 * take profit, stop loss, and invoking the Neural Network Routing Advisor.
 * The goal of this page is to view charts, analyze technical metrics, and execute trades.
 *
 * @returns Charts view page component
 */
export function ChartsPage() {
  const { t } = useI18n();
  const toast = useToast();

  const mountRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seriesRef = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volSeriesRef = useRef<ISeriesApi<any> | null>(null);
  const liveGenRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const stockPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionOpenPriceRef = useRef<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [searchParams] = useSearchParams();
  const paramSymbol = searchParams.get('symbol');
  const paramCategory = searchParams.get('category');

  const [category, setCategory] = useState<Category>((paramCategory as Category) || 'forex');
  const [symbol, setSymbol] = useState(paramSymbol || 'EURUSD');
  const [interval, setInterval_] = useState<Interval>('1h');
  const [bidAsk, setBidAsk] = useState('—');
  const [livePrice, setLivePrice] = useState(t('common.loading'));
  const [liveChange, setLiveChange] = useState('—');
  const [liveChangePct, setLiveChangePct] = useState(0);
  const [status, setStatus] = useState('');
  /** True only when the exchange did not answer and the candles were drawn here. */
  const [feed, setFeed] = useState<'live' | 'candles'>('live');
  const feedRef = useRef<'live' | 'candles'>('live');
  const [orderType, setOrderType] = useState<OrderType>('MARKET');
  const [volume, setVolume] = useState('1.00');
  const [entryPrice, setEntryPrice] = useState('');
  const [takeProfit, setTakeProfit] = useState('');
  const [stopLoss, setStopLoss] = useState('');
  const [bottomTab, setBottomTab] = useState<'positions' | 'pending'>('positions');
  const [chartLivePrices, setChartLivePrices] = useState<Record<string, number>>({});

  // Shared data via React Query — same cache as Dashboard and Positions pages
  const { data: overviewData } = useBrokerOverview();
  const { data: positionsData, isLoading: posLoading } = usePositions();
  const { data: pendingData } = usePendingOrders();
  const pendingOrders = (Array.isArray(pendingData) ? pendingData : [])
    .filter((o) => o.orderType !== 'CLOSE');
  const { mutateAsync: cancelOrder } = useCancelOrder();
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const invalidateAfterTrade = useInvalidateAfterTrade();

  const positions = (Array.isArray(positionsData) ? positionsData : []).filter(
    (p) => Number(p.quantity ?? 0) !== 0,
  );

  const queryLivePrices = useLivePrices(positions.map((p) => p.symbolCode));
  const livePrices = {
    ...queryLivePrices,
    ...chartLivePrices,
  };
  const balance = overviewData
    ? '$' + Number(overviewData.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })
    : '—';
  const positionQty = positions.find((p) => p.symbolCode.toUpperCase() === symbol.toUpperCase())
    ? Number(positions.find((p) => p.symbolCode.toUpperCase() === symbol.toUpperCase())!.quantity).toFixed(2)
    : '0.00';

  const [isChartReady, setIsChartReady] = useState(false);

  // Manage drawing active LIMIT order price line and all position/pending price lines on the chart
  const priceLinesRef = useRef<any[]>([]);
  const positionsKey = JSON.stringify(positions.map((p) => `${p.id}_${p.symbolCode}_${p.side}_${p.avgPrice}_${p.stopLoss}_${p.takeProfit}`));
  const pendingKey = JSON.stringify(pendingOrders.map((o) => `${o.id}_${o.symbolCode}_${o.side}_${o.limitPrice}_${o.stopPrice}`));

  useEffect(() => {
    const series = seriesRef.current;
    if (!series || !isChartReady) return;

    // Clear all existing price lines first
    priceLinesRef.current.forEach((line) => {
      try {
        series.removePriceLine(line);
      } catch { /* */ }
    });
    priceLinesRef.current = [];

    // 1. Draw Active Typing Limit line
    if (orderType === 'LIMIT' && entryPrice) {
      const priceVal = parseFloat(entryPrice);
      if (priceVal > 0 && !isNaN(priceVal)) {
        try {
          const activeLine = series.createPriceLine({
            price: priceVal,
            color: '#ca8a04', // Yellow color matching the "Limit" active button
            lineWidth: 2,
            lineStyle: 2, // Dashed line style
            axisLabelVisible: true,
            title: `${t('trading.limit') || 'Limit'} Order @ ${priceVal.toFixed(4)}`,
          });
          priceLinesRef.current.push(activeLine);
        } catch (e) {
          console.error("Failed to create active limit price line", e);
        }
      }
    }

    if (!symbol) return;
    const currentSym = symbol.toUpperCase();

    // 2. Draw Open Positions Entry Price, SL, and TP Lines
    const activePos = positions.filter(p => p.symbolCode.toUpperCase() === currentSym);
    activePos.forEach((p) => {
      const avgPrice = Number(p.avgPrice ?? 0);
      if (avgPrice > 0) {
        const isShort = p.side === 'SHORT';
        const qty = Math.abs(Number(p.quantity ?? 0));
        
        try {
          // Entry Line
          const entryLine = series.createPriceLine({
            price: avgPrice,
            color: isShort ? '#ef4444' : '#22c55e', // Red for SHORT, Green for LONG
            lineWidth: 2,
            lineStyle: 0, // Solid
            axisLabelVisible: true,
            title: `Position ${isShort ? 'SHORT' : 'LONG'} ${qty.toFixed(2)} @ ${avgPrice.toFixed(4)}`,
          });
          priceLinesRef.current.push(entryLine);

          // Take Profit Line
          const tp = p.takeProfit ? Number(p.takeProfit) : 0;
          if (tp > 0) {
            const tpLine = series.createPriceLine({
              price: tp,
              color: '#10b981', // Teal/Green
              lineWidth: 1,
              lineStyle: 1, // Dotted
              axisLabelVisible: true,
              title: `TP @ ${tp.toFixed(4)}`,
            });
            priceLinesRef.current.push(tpLine);
          }

          // Stop Loss Line
          const sl = p.stopLoss ? Number(p.stopLoss) : 0;
          if (sl > 0) {
            const slLine = series.createPriceLine({
              price: sl,
              color: '#f43f5e', // Rose/Red
              lineWidth: 1,
              lineStyle: 1, // Dotted
              axisLabelVisible: true,
              title: `SL @ ${sl.toFixed(4)}`,
            });
            priceLinesRef.current.push(slLine);
          }
        } catch (e) {
          console.error("Failed to draw position lines", e);
        }
      }
    });

    // 3. Draw Existing Pending Orders target price lines
    const activePending = pendingOrders.filter(o => o.symbolCode.toUpperCase() === currentSym && o.orderType !== 'CLOSE');
    activePending.forEach((o) => {
      const limitVal = o.limitPrice ? Number(o.limitPrice) : 0;
      const stopVal = o.stopPrice ? Number(o.stopPrice) : 0;
      const targetVal = limitVal > 0 ? limitVal : stopVal;
      
      if (targetVal > 0) {
        try {
          const qty = Math.abs(Number(o.quantity ?? 0));
          const pendingLine = series.createPriceLine({
            price: targetVal,
            color: '#eab308', // Yellow
            lineWidth: 1,
            lineStyle: 2, // Dashed
            axisLabelVisible: true,
            title: `Pending ${o.side} ${o.orderType} ${qty.toFixed(2)} @ ${targetVal.toFixed(4)}`,
          });
          priceLinesRef.current.push(pendingLine);
        } catch (e) {
          console.error("Failed to draw pending order lines", e);
        }
      }
    });

    return () => {
      priceLinesRef.current.forEach((line) => {
        try {
          series.removePriceLine(line);
        } catch { /* */ }
      });
      priceLinesRef.current = [];
    };
  }, [orderType, entryPrice, symbol, positionsKey, pendingKey, isChartReady, t]);

  useEffect(() => {
    document.title = t('titles.charts');
  }, [t]);

  // Init chart
  useEffect(() => {
    if (!mountRef.current || chartRef.current) return;
    const chart = createChart(mountRef.current, {
      width: mountRef.current.clientWidth,
      height: mountRef.current.clientHeight || 420,
      ...chartColors(),
    });
    chartRef.current = chart;

    seriesRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    });
    setIsChartReady(true);
    volSeriesRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'volume', color: '#6366f120',
    });
    if (volSeriesRef.current) {
      volSeriesRef.current.priceScale().applyOptions({ scaleMargins: { top: 0.80, bottom: 0 } });
    }

    const onResize = () => { if (chart && mountRef.current) chart.applyOptions({ width: mountRef.current.clientWidth }); };
    window.addEventListener('resize', onResize);

    const mo = new MutationObserver(() => { if (chart) chart.applyOptions(chartColors()); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    return () => {
      window.removeEventListener('resize', onResize);
      mo.disconnect();
      stopLive();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      volSeriesRef.current = null;
    };
  }, []);

  function stopLive() {
    sessionOpenPriceRef.current = null;
    if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null; }
    if (wsRef.current) { try { wsRef.current.close(); } catch { /* */ } wsRef.current = null; }
    if (stockPollRef.current) { clearInterval(stockPollRef.current); stockPollRef.current = null; }
    if (synthTickRef.current) { clearInterval(synthTickRef.current); synthTickRef.current = null; }
  }

  function setChartData(data: Candle[]) {
    if (!seriesRef.current) return;
    seriesRef.current.setData(data);
    if (volSeriesRef.current) {
      const light = isLightTheme();
      volSeriesRef.current.setData(data.map(d => ({
        time: d.time,
        value: d.volume ?? Math.round(Math.abs(d.close - d.open) / d.close * 1e4 + 200),
        color: d.close >= d.open
          ? (light ? 'rgba(34,197,94,0.25)' : 'rgba(34,197,94,0.20)')
          : (light ? 'rgba(239,68,68,0.25)' : 'rgba(239,68,68,0.20)'),
      })));
    }
  }

  function updateBar(bar: Candle) {
    if (!seriesRef.current) return;
    seriesRef.current.update(bar);
    volSeriesRef.current?.update({
      time: bar.time, value: bar.volume ?? 300,
      color: bar.close >= bar.open ? 'rgba(34,197,94,0.22)' : 'rgba(239,68,68,0.22)',
    });
  }

  function updateBidAsk(instr: Instrument, close: number) {
    const d = instr.decimals;
    const spread = close * 0.00015;
    setBidAsk(t('charts.bidAskFormatted', { bid: (close - spread).toFixed(d), ask: (close + spread).toFixed(d) }));
    setLivePrice(close > 100 ? close.toFixed(2) : close.toFixed(d));
    if (sessionOpenPriceRef.current == null && close !== 0) sessionOpenPriceRef.current = close;
    const open = sessionOpenPriceRef.current;
    if (open == null || open === 0) {
      setLiveChange('—');
      setLiveChangePct(0);
    } else {
      const pct = ((close - open) / open) * 100;
      setLiveChange(`${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`);
      setLiveChangePct(pct);
    }
    // Keep live price map updated so positions table reflects chart feed
    setChartLivePrices(prev => ({ ...prev, [instr.id.toUpperCase()]: close }));
  }

  const loadChart = useCallback(async (cat: Category, sym: string, iv: Interval) => {
    if (!seriesRef.current) return;
    stopLive();
    const gen = ++liveGenRef.current;
    const cfg = CATEGORY_CONFIG[cat];
    const instr = cfg.instruments.find(i => i.id === sym) ?? cfg.instruments[0];
    const source = instr.source ?? cfg.source;
    setStatus(t('charts.loading'));
    const markFeed = (next: 'live' | 'candles') => {
      feedRef.current = next;
      setFeed(next);
    };
    if (mountRef.current) { mountRef.current.style.opacity = '0.4'; mountRef.current.style.transition = 'opacity 0.15s'; }
    const fadeIn = () => { if (mountRef.current) mountRef.current.style.opacity = '1'; };

    try {
      if (source === 'bybit') {
        let data: Candle[];
        let restOk = true;
        try { data = await fetchBybitKlines(sym, iv); }
        catch { restOk = false; data = syntheticCandles(sym, iv); }
        if (gen !== liveGenRef.current) return;
        setChartData(data); chartRef.current?.timeScale().fitContent(); fadeIn();
        const last = data[data.length - 1];
        if (last) updateBidAsk(instr, last.close);
        markFeed(restOk ? 'live' : 'candles');
        setStatus(restOk ? (t('charts.liveBybit') || 'Live (Bybit)') : t('charts.syntheticCandles'));

        const mappedSym = mapToBybitSymbol(sym);
        const ivMap: Record<Interval, string> = {
          '1m': '1', '5m': '5', '1h': '60', '4h': '240',
          '1d': 'D', '1w': 'W', '1M': 'M',
        };
        const mappedIv = ivMap[iv] || '60';

        const ws = new WebSocket(BYBIT_WS);
        wsRef.current = ws;
        ws.onopen = () => {
          if (gen === liveGenRef.current && feedRef.current === 'live') {
            setStatus(t('charts.liveBybit') || 'Live (Bybit)');
            ws.send(JSON.stringify({
              op: 'subscribe',
              args: [`kline.${mappedIv}.${mappedSym}`]
            }));
          }
        };
        ws.onmessage = (ev) => {
          if (gen !== liveGenRef.current) return;
          try {
            const msg = JSON.parse(ev.data as string);
            if (msg.topic && msg.data && msg.data[0]) {
              const k = msg.data[0];
              const bar: Candle = {
                time: Math.floor(Number(k.start) / 1000) as UTCTimestamp,
                open: parseFloat(k.open),
                high: parseFloat(k.high),
                low: parseFloat(k.low),
                close: parseFloat(k.close),
              };
              updateBar(bar);
              updateBidAsk(instr, bar.close);
            }
          } catch { /* */ }
        };
        ws.onclose = () => {
          if (gen !== liveGenRef.current || wsRef.current !== ws) return;
          wsRef.current = null;
          if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
          reconnectTimerRef.current = setTimeout(() => {
            reconnectTimerRef.current = null;
            if (gen === liveGenRef.current) void loadChart(cat, sym, iv);
          }, 2500);
        };
      } else {
        let realPrice: number | null = null;
        try {
          const r = await fetch(`/api/market/price/${encodeURIComponent(sym)}`);
          if (r.ok) { const pd = await r.json() as { price?: number }; if (pd?.price) realPrice = Number(pd.price); }
        } catch { /* */ }

        let data: Candle[];
        let yahooOk = true;
        try { data = await fetchYahooCandles(sym, iv, cat); }
        catch { yahooOk = false; data = syntheticCandles(sym, iv, 300, realPrice); }
        if (gen !== liveGenRef.current) return;
        setChartData(data); chartRef.current?.timeScale().fitContent(); fadeIn();
        const lastYahoo = data[data.length - 1];
        if (realPrice) updateBidAsk(instr, realPrice);
        else if (lastYahoo) updateBidAsk(instr, lastYahoo.close);
        markFeed(yahooOk ? 'live' : 'candles');
        setStatus(yahooOk ? t('charts.liveYahoo') : t('charts.syntheticCandles'));

        let currentBar: Candle | null = lastYahoo ? { ...lastYahoo } : null;
        if (realPrice && currentBar) {
          currentBar = { ...currentBar, close: realPrice, high: Math.max(currentBar.high, realPrice), low: Math.min(currentBar.low, realPrice) };
          updateBar(currentBar);
        }

        let lastPriceVal = realPrice || (lastYahoo ? lastYahoo.close : defaultPrice(sym));

        const tickPrice = () => {
          if (gen !== liveGenRef.current) return;
          // Generate a tiny random walk around the last price
          const jitterPercent = sym.includes('XAU') ? 0.00012 : 0.00004;
          const change = (Math.random() - 0.5) * lastPriceVal * jitterPercent;
          const price = lastPriceVal + change;
          lastPriceVal = price;

          updateBidAsk(instr, price);
          // Keep chartLivePrices in sync so the positions table below the chart
          // shows sub-second price updates for the currently active symbol,
          // matching the same 500ms jitter behaviour as PositionsPage.
          setChartLivePrices((prev) => ({ ...prev, [sym.toUpperCase()]: price }));
          const sec2 = INTERVAL_SECONDS[iv] ?? 3600;
          const bucket = Math.floor(Math.floor(Date.now() / 1000) / sec2) * sec2;
          if (!currentBar || bucket > currentBar.time) {
            currentBar = { time: bucket as UTCTimestamp, open: price, high: price, low: price, close: price };
          } else {
            currentBar.high = Math.max(currentBar.high, price);
            currentBar.low = Math.min(currentBar.low, price);
            currentBar.close = price;
          }
          updateBar(currentBar);
        };

        // Start real-time sub-second micro-tick updates (every 500ms)
        synthTickRef.current = setInterval(tickPrice, 500);

        const pollPrice = async () => {
          if (gen !== liveGenRef.current) return;
          try {
            const r2 = await fetch(`/api/market/price/${encodeURIComponent(sym)}`);
            const pd = r2.ok ? await r2.json() as { price?: number } : null;
            if (pd?.price) {
              const price = Number(pd.price);
              // Nudge lastPriceVal gently towards real market price
              lastPriceVal = (lastPriceVal * 0.2) + (price * 0.8);
            }
          } catch { /* */ }
        };
        // Sync with backend every 5 seconds
        stockPollRef.current = setInterval(pollPrice, STOCK_POLL_MS);
      }
    } catch {
      if (gen !== liveGenRef.current) return;
      fadeIn(); setStatus(t('charts.errorLoad')); setChartData([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  // Debounced reload
  function debouncedLoad(cat: Category, sym: string, iv: Interval) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void loadChart(cat, sym, iv); }, 250);
  }

  // Initial load + reload when the chart is ready or the symbol/interval changes
  useEffect(() => {
    if (!isChartReady || !seriesRef.current) return;
    debouncedLoad(category, symbol, interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChartReady, category, symbol, interval]);

  // chartLivePrices is updated inside tickPrice (every 500ms) for the active chart symbol.
  // All other position symbols get live prices through queryLivePrices (useLivePrices hook),
  // which already runs its own 500ms jitter + 5s backend poll — same as PositionsPage.

  const [loanOffer, setLoanOffer] = useState<LoanOfferDetails | null>(null);

  async function placeOrder(side: 'BUY' | 'SELL', acceptLoan = false) {
    const qty = Number(volume);
    if (!symbol || !qty || qty <= 0) { toast.show(t('trading.errBadOrder'), { variant: 'warning' }); return; }
    if (orderType !== 'MARKET' && (!entryPrice || Number(entryPrice) <= 0)) {
      toast.show(t('trading.errEntryPriceRequired'), { variant: 'warning' }); return;
    }
    try {
      const payload: Record<string, unknown> = {
        side,
        symbolCode: symbol,
        quantity: qty,
        orderType,
        takeProfit: takeProfit ? Number(takeProfit) : undefined,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        acceptLoan: acceptLoan ? true : undefined,
      };
      if (orderType === 'LIMIT') payload.limitPrice = Number(entryPrice);
      const res = await apiPostJson('/api/broker/orders', payload);
      const data = await res.json() as PlaceOrderResponse & {
        shortfall?: number;
        required?: number;
        cashBalance?: number;
        creditLimit?: number;
        dailyInterestRate?: number;
      };
      if (res.ok) {
        if (data.status === 'NEW') {
          toast.show(t('trading.orderPlaced', { side, symbol }), { variant: 'success' });
        } else {
          toast.show(t('trading.orderFilled', { side, symbol, price: data.fillPrice ?? '', balance: Number(data.newBalance ?? 0).toFixed(2) }), { variant: 'success' });
        }
        setTakeProfit('');
        setStopLoss('');
        invalidateAfterTrade();
      } else {
        if (data.error === 'credit_offer_available') {
          setLoanOffer({
            shortfall: Number(data.shortfall ?? 0),
            required: Number(data.required ?? 0),
            cashBalance: Number(data.cashBalance ?? 0),
            creditLimit: Number(data.creditLimit ?? 10000),
            dailyInterestRate: Number(data.dailyInterestRate ?? 0.005),
            symbol,
            side,
            onConfirm: () => {
              setLoanOffer(null);
              void placeOrder(side, true);
            },
            onCancel: () => setLoanOffer(null),
          });
          return;
        }

        const knownErrors: Record<string, string> = {
          credit_limit_exceeded: t('trading.errCreditLimitExceeded'),
          insufficient_funds: t('trading.errInsufficientFunds'),
          insufficient_funds_for_short: t('trading.errInsufficientFunds'),
          price_unavailable: t('trading.errPriceUnavailable'),
        };
        const message = (data.error && knownErrors[data.error]) || (t('trading.errOrderFailed') + ': ' + (data.error ?? ''));
        toast.show(message, { variant: 'error' });
      }
    } catch { toast.show(t('trading.errOrderFailed'), { variant: 'error' }); }
  }


  async function handleCancelOrder(orderId: number, symbol: string) {
    setCancellingId(orderId);
    try {
      await cancelOrder(orderId);
      toast.show(`${symbol} — ${t('alerts.orderCancelled') || 'Order cancelled'}`, { variant: 'success' });
      invalidateAfterTrade();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('alerts.cancelFail') || 'Cancel failed', { variant: 'error' });
    } finally {
      setCancellingId(null);
    }
  }

  async function closeInlinePosition(id: number, sym: string) {
    try {
      const res = await apiPostJson(`/api/broker/positions/${id}/close`, {});
      const data = await res.json() as ClosePositionResponse;
      if (res.ok && data.ok) {
        const msg = t('alerts.closeOk', { symbol: sym }) + (data.closePnl ? ` (P/L: ${data.closePnl})` : '');
        toast.show(msg, { variant: 'success' });
        invalidateAfterTrade();
      } else {
        toast.show(t('alerts.closeFail'), { variant: 'error' });
      }
    } catch { toast.show(t('alerts.closeFail'), { variant: 'error' }); }
  }

  const instruments = CATEGORY_CONFIG[category].instruments;

  return (
    <>
      <BackPageHeader titleKey="charts.title" />

      <div className="container mt-20">
        <p className="charts-disclaimer mb-20">{t('charts.dataNote')}</p>

        {/* Category tabs */}
        <div className="flex-gap flex-wrap mb-16">
          {(['forex', 'metals', 'crypto'] as Category[]).map((cat) => (
            <button
              key={cat}
              type="button"
              className={`btn ${category === cat ? 'btn-primary' : 'btn-outline-dark'}`}
              onClick={() => {
                const newSym = CATEGORY_CONFIG[cat].instruments[0].id;
                setCategory(cat); setSymbol(newSym);
              }}
            >
              {t(`charts.cat${cat.charAt(0).toUpperCase() + cat.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* Instrument buttons */}
        <div className="flex-gap flex-wrap mb-16">
          {instruments.map((instr) => (
            <button
              key={instr.id}
              type="button"
              className={`btn ${symbol === instr.id ? 'btn-primary' : 'btn-outline-dark'}`}
              onClick={() => setSymbol(instr.id)}
            >
              {instr.title}
            </button>
          ))}
        </div>

        {/* Interval buttons */}
        <div className="flex-gap flex-wrap mb-24">
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              className={`btn ${interval === iv ? 'btn-primary' : 'btn-outline-dark'}`}
              style={{ padding: '8px 14px', fontSize: '0.85rem' }}
              onClick={() => setInterval_(iv)}
            >
              {iv}
            </button>
          ))}
        </div>

        {/* Main layout */}
        <div className="charts-main-layout">
          {/* Left: chart */}
          <div className="charts-left-col">
            <div className="card chart-preview-area" style={{ position: 'relative' }}>
              {/* Zoom toolbar */}
              {feed === 'candles' ? (
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 12,
                    zIndex: 10,
                    padding: '6px 10px',
                    borderRadius: 8,
                    background: 'rgba(234, 179, 8, 0.16)',
                    border: '1px solid rgba(234, 179, 8, 0.5)',
                    color: 'var(--accent, #eab308)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    maxWidth: '70%',
                  }}
                >
                  {t('charts.syntheticCandles')}
                </div>
              ) : null}
              <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 10, display: 'flex', gap: 6, opacity: 0.75 }}>
                {[
                  { id: 'zi', label: '+', action: () => { const ts = chartRef.current?.timeScale(); const r = ts?.getVisibleLogicalRange(); if (r) { const m = (r.from + r.to) / 2, h = (r.to - r.from) / 2 * 0.65; ts?.setVisibleLogicalRange({ from: m - h, to: m + h }); } } },
                  { id: 'zo', label: '−', action: () => { const ts = chartRef.current?.timeScale(); const r = ts?.getVisibleLogicalRange(); if (r) { const m = (r.from + r.to) / 2, h = (r.to - r.from) / 2 * 1.45; ts?.setVisibleLogicalRange({ from: m - h, to: m + h }); } } },
                  { id: 'fit', label: '⊡', action: () => chartRef.current?.timeScale().fitContent() },
                  { id: 'now', label: '▶|', action: () => chartRef.current?.timeScale().scrollToRealTime() },
                ].map(({ id, label, action }) => (
                  <button key={id} type="button" className="chart-ctrl-btn" onClick={action}>{label}</button>
                ))}
              </div>
              <div ref={mountRef} className="chart-mount" />
            </div>

            <div className="card flex-between mt-20 flex-wrap gap-16">
              <div>
                <div className="font-bold text-xl text-primary">{symbol}</div>
                <div className="text-secondary text-sm">{bidAsk}</div>
              </div>
              <div className="text-sm text-secondary">{status}</div>
            </div>
          </div>

          {/* Right: trading panel */}
          <div className="charts-right-col">
            <div className="card trading-panel-card">
              {/* Live price banner */}
              <div className="mb-20">
                <div className="live-price-banner">
                  <div>
                    <div className="text-xs text-muted mb-4">{t('trading.livePriceLabel')}</div>
                    <div className="live-price-text">{livePrice}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="text-xs text-muted mb-4">{t('trading.changeLabel')}</div>
                    <div className="live-change-text" style={{ color: liveChangePct >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)' }}>
                      {liveChange}
                    </div>
                  </div>
                </div>
              </div>

              {/* Order type */}
              <div className="form-group">
                <label>{t('trading.orderType')}</label>
                <div className="flex-gap">
                  {(['MARKET', 'LIMIT'] as OrderType[]).map((ot) => (
                    <button
                      key={ot}
                      type="button"
                      className={`btn ${orderType === ot ? 'btn-primary' : 'btn-outline-dark'}`}
                      style={{ flex: 1 }}
                      onClick={() => setOrderType(ot)}
                    >
                      {t(`trading.${ot.toLowerCase()}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Entry price */}
              <div className="form-group">
                <label>{t('trading.entryPrice')}</label>
                <input
                  type="text"
                  className="form-control"
                  disabled={orderType === 'MARKET'}
                  style={orderType === 'MARKET' ? { opacity: 0.65, cursor: 'not-allowed', backgroundColor: 'var(--bg-alt)' } : undefined}
                  placeholder={orderType === 'MARKET' ? livePrice : t('trading.placeholderPrice')}
                  value={orderType === 'MARKET' ? livePrice : entryPrice}
                  onChange={(e) => { if (orderType !== 'MARKET') setEntryPrice(e.target.value); }}
                />
              </div>

              {/* Volume */}
              <div className="form-group mt-16">
                <label>{t('trading.volume')}</label>
                <div className="flex-gap">
                  <button type="button" className="btn btn-outline-dark" style={{ width: 44 }}
                    onClick={() => { const v = parseFloat(volume) || 0.1; if (v > 0.1) setVolume((v - 0.1).toFixed(2)); }}>−</button>
                  <input type="number" className="form-control text-center font-bold" step="0.1"
                    value={volume} onChange={(e) => setVolume(e.target.value)} />
                  <button type="button" className="btn btn-outline-dark" style={{ width: 44 }}
                    onClick={() => setVolume(((parseFloat(volume) || 0) + 0.1).toFixed(2))}>+</button>
                </div>
              </div>

              {/* SL / TP (Optional) */}
              <div className="flex-gap mt-16">
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('trading.stopLoss') || 'Stop Loss (SL)'}</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    placeholder="None"
                    value={stopLoss}
                    onChange={(e) => setStopLoss(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t('trading.takeProfit') || 'Take Profit (TP)'}</label>
                  <input
                    type="number"
                    step="0.0001"
                    className="form-control"
                    placeholder="None"
                    value={takeProfit}
                    onChange={(e) => setTakeProfit(e.target.value)}
                  />
                </div>
              </div>

              {/* Portfolio summary */}
              <div className="mt-16 portfolio-summary-card">
                <div className="flex-between mb-8">
                  <span className="text-sm text-secondary">{t('dashboard.balance')}</span>
                  <span className="font-bold">{balance}</span>
                </div>
                <div className="flex-between">
                  <span className="text-sm text-secondary">{t('trading.position')}</span>
                  <span className="font-bold">{positionQty}</span>
                </div>
              </div>


              {/* BUY / SELL */}
              <div className="flex-gap mt-20">
                <button type="button" className="btn btn-danger" style={{ flex: 1, padding: 14 }}
                  onClick={() => void placeOrder('SELL')}>{t('trading.sell')}</button>
                <button type="button" className="btn btn-success" style={{ flex: 1, padding: 14 }}
                  onClick={() => void placeOrder('BUY')}>{t('trading.buy')}</button>
              </div>
            </div>
          </div>
        </div>

        {/* Inline positions */}
        <div className="mt-20">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                type="button"
                onClick={() => setBottomTab('positions')}
                className={`btn ${bottomTab === 'positions' ? 'btn-primary' : 'btn-outline-dark'}`}
                style={{ fontSize: '0.85rem', padding: '6px 16px' }}
              >
                {t('trading.openPositions') || 'Open Positions'} ({positions.length})
              </button>
              <button
                type="button"
                onClick={() => setBottomTab('pending')}
                className={`btn ${bottomTab === 'pending' ? 'btn-primary' : 'btn-outline-dark'}`}
                style={{ fontSize: '0.85rem', padding: '6px 16px' }}
              >
                {t('positions.pending') || 'Pending Orders'} ({pendingOrders.length})
              </button>
            </div>
            <button className="btn btn-outline-dark" style={{ fontSize: '0.8rem', padding: '6px 12px' }}
              onClick={() => invalidateAfterTrade()}>{t('common.refresh')}</button>
          </div>
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            {bottomTab === 'positions' ? (
              <table className="positions-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-alt)' }}>
                    <th>{t('table.symbol')}</th>
                    <th className="num">{t('table.volume')}</th>
                    <th className="num">{t('table.openPrice')}</th>
                    <th className="num">{t('table.currentPrice')}</th>
                    <th className="num">{t('table.pl')}</th>
                    <th className="center">{t('common.close')}</th>
                  </tr>
                </thead>
                <tbody>
                  {posLoading ? (
                    <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('common.loading')}</td></tr>
                  ) : positions.length === 0 ? (
                    <tr><td colSpan={6} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('trading.noPositions')}</td></tr>
                  ) : (
                    positions.map((p) => {
                      const qty = Number(p.quantity ?? 0);
                      const avg = Number(p.avgPrice ?? 0);
                      const live = livePrices[p.symbolCode.toUpperCase()];
                      const pnl = live ? (p.side === 'SHORT' ? -1 : 1) * (live - avg) * qty * getContractSize(p.symbolCode) : Number(p.unrealizedPnl ?? 0);
                      const pnlColor = pnl >= 0 ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)';
                      return (
                        <tr key={p.id} style={{ borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                          <td style={{ fontWeight: 600 }}>{p.symbolCode}</td>
                          <td className="num">{fmtP(qty)}</td>
                          <td className="num" style={{ color: 'var(--text-secondary)' }}>{fmtP(avg)}</td>
                          <td className="num">
                            {live
                              ? <span style={{ fontWeight: 500 }}>{fmtP(live)}</span>
                              : <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', display: 'inline-block', minWidth: '7ch', textAlign: 'end' }}>…</span>
                            }
                          </td>
                          <td className="num" style={{ fontWeight: 600, color: pnlColor }}>
                            {pnl >= 0 ? '+' : ''}{fmtMoney2(pnl)}
                          </td>
                          <td className="center">
                            <button className="btn btn-danger" style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              onClick={() => void closeInlinePosition(p.id, p.symbolCode)}>✕</button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              <table className="positions-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-alt)' }}>
                    <th>{t('table.symbol') || 'Symbol'}</th>
                    <th>{t('table.type') || 'Type'}</th>
                    <th>{t('common.side') || 'Side'}</th>
                    <th className="num">{t('table.volume') || 'Volume'}</th>
                    <th className="num">{t('common.limitPrice') || 'Limit Price'}</th>
                    <th className="num">{t('common.stopPrice') || 'Stop Price'}</th>
                    <th className="center">{t('table.action') || 'Action'}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingOrders.length === 0 ? (
                    <tr><td colSpan={7} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{t('positions.noPending') || 'No pending orders'}</td></tr>
                  ) : (
                    pendingOrders.map((o) => {
                      const isCancelling = cancellingId === o.id;
                      const limitVal = o.limitPrice ? Number(o.limitPrice) : null;
                      const stopVal = o.stopPrice ? Number(o.stopPrice) : null;
                      return (
                        <tr key={o.id} style={{ borderTop: '1px solid var(--border-color, rgba(255,255,255,0.08))' }}>
                          <td style={{ fontWeight: 600 }}>{o.symbolCode}</td>
                          <td>
                            <span className="badge" style={{ background: 'var(--primary)', color: '#fff', fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4 }}>
                              {o.orderType}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${o.side === 'BUY' ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem', padding: '2px 6px', borderRadius: 4 }}>
                              {o.side}
                            </span>
                          </td>
                          <td className="num">{fmtP(o.quantity)}</td>
                          <td className="num" style={{ color: 'var(--text-secondary)' }}>{o.orderType === 'CLOSE' || !limitVal ? '—' : fmtP(limitVal)}</td>
                          <td className="num" style={{ color: 'var(--text-secondary)' }}>{stopVal ? fmtP(stopVal) : '—'}</td>
                          <td className="center">
                            <button
                              className="btn btn-outline-danger"
                              style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                              disabled={isCancelling}
                              onClick={() => void handleCancelOrder(o.id, o.symbolCode)}
                            >
                              {isCancelling ? '...' : '✕'}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
      {loanOffer && <LoanOfferModal {...loanOffer} />}
    </>
  );
}

