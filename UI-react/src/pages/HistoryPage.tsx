import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, useTradeHistory } from '@/hooks/useApi';
import type { BrokerOrder } from '@/types/api';

// ── Types ────────────────────────────────────────────────────────────────────

interface PairedTrade {
  id: number;
  symbolCode: string;
  quantity: string;
  openTime?: string;
  openPrice?: string;
  closeTime?: string;
  closePrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  realizedPnl?: string;
}

// ── Pairing logic ─────────────────────────────────────────────────────────────
// Match BUY → SELL chronologically per symbol (FIFO).
// Returns only completed pairs (SELL side).

function pairOrders(orders: BrokerOrder[]): PairedTrade[] {
  const bySymbol: Record<string, { buys: BrokerOrder[]; sells: BrokerOrder[] }> = {};

  for (const o of orders) {
    if (!bySymbol[o.symbolCode]) bySymbol[o.symbolCode] = { buys: [], sells: [] };
    if (o.side === 'BUY') bySymbol[o.symbolCode].buys.push(o);
    else bySymbol[o.symbolCode].sells.push(o);
  }

  const pairs: PairedTrade[] = [];

  for (const sym of Object.keys(bySymbol)) {
    const buys = [...bySymbol[sym].buys].sort(
      (a, b) => ts(a.filledAt || a.createdAt) - ts(b.filledAt || b.createdAt),
    );
    const sells = [...bySymbol[sym].sells].sort(
      (a, b) => ts(a.filledAt || a.createdAt) - ts(b.filledAt || b.createdAt),
    );

    sells.forEach((sell, i) => {
      const buy = buys[i];
      pairs.push({
        id: sell.id,
        symbolCode: sym,
        quantity: sell.quantity,
        openTime: buy?.filledAt || buy?.createdAt,
        openPrice: buy?.entryPrice,
        closeTime: sell.filledAt || sell.createdAt,
        closePrice: sell.entryPrice,
        stopLoss: buy?.stopLoss,
        takeProfit: buy?.takeProfit,
        realizedPnl: sell.realizedPnl,
      });
    });
  }

  return pairs.sort((a, b) => ts(b.closeTime) - ts(a.closeTime));
}

function ts(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

// ── Formatters ────────────────────────────────────────────────────────────────

const LANG_LOCALE: Record<string, string> = { en: 'en-US', ru: 'ru-RU', he: 'he-IL' };

function fmtTime(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(LANG_LOCALE[locale] ?? locale, {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function fmtPrice(n: unknown): string {
  if (n == null) return '—';
  const v = Number(n);
  if (isNaN(v) || v === 0) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

function fmtQty(n: unknown): string {
  if (n == null) return '—';
  const v = Number(n);
  return isNaN(v) ? '—' : v.toFixed(4);
}

function fmtPl(n: unknown, currency: string, locale: string): string {
  if (n == null) return '—';
  const v = Number(n);
  if (isNaN(v)) return '—';
  const abs = new Intl.NumberFormat(LANG_LOCALE[locale] ?? locale, {
    style: 'currency', currency, maximumFractionDigits: 2,
  }).format(Math.abs(v));
  return `${v >= 0 ? '+' : '−'}${abs}`;
}

function exportCsv(trades: PairedTrade[], currency: string, locale: string) {
  const headers = ['#', 'Symbol', 'Volume', 'Open Time', 'Open Price', 'Close Time', 'Close Price', 'S/L', 'T/P', 'P/L'];
  const rows = trades.map((t) => [
    t.id, t.symbolCode, fmtQty(t.quantity),
    fmtTime(t.openTime, locale), fmtPrice(t.openPrice),
    fmtTime(t.closeTime, locale), fmtPrice(t.closePrice),
    fmtPrice(t.stopLoss), fmtPrice(t.takeProfit),
    t.realizedPnl != null ? fmtPl(t.realizedPnl, currency, locale) : '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function HistoryPage() {
  const { t, lang } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [filtered, setFiltered] = useState<PairedTrade[]>([]);

  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);

  const { data: overview, error: overviewError } = useBrokerOverview();
  const { data: historyData, isLoading } = useTradeHistory();

  const currency = overview?.currency || 'USD';

  useEffect(() => { document.title = t('titles.history'); }, [t]);

  useEffect(() => {
    if (overviewError && (overviewError as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 800);
    }
  }, [overviewError, navigate, t, toast]);

  const allOrders: BrokerOrder[] = Array.isArray(historyData) ? historyData : [];
  const allPairs = pairOrders(allOrders);

  useEffect(() => {
    setFiltered(allPairs);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyData]);

  function applyFilters() {
    let result = [...allPairs];
    const from = dateFromRef.current?.value;
    const to = dateToRef.current?.value;
    const sym = symbolRef.current?.value.trim().toUpperCase();
    if (from) result = result.filter((o) => ts(o.closeTime) >= new Date(from).getTime());
    if (to) result = result.filter((o) => ts(o.closeTime) <= new Date(to + 'T23:59:59').getTime());
    if (sym) result = result.filter((o) => o.symbolCode.toUpperCase().includes(sym));
    setFiltered(result);
  }

  function handleReset() {
    if (dateFromRef.current) dateFromRef.current.value = '';
    if (dateToRef.current) dateToRef.current.value = '';
    if (symbolRef.current) symbolRef.current.value = '';
    setFiltered(allPairs);
  }

  // Stats
  const withPl = filtered.filter((o) => o.realizedPnl != null);
  const netPl = withPl.reduce((s, o) => s + Number(o.realizedPnl), 0);
  const wins = withPl.filter((o) => Number(o.realizedPnl) > 0).length;
  const losses = withPl.filter((o) => Number(o.realizedPnl) <= 0).length;
  const winRate = withPl.length > 0 ? (wins / withPl.length) * 100 : null;
  const bestPl = withPl.length > 0 ? Math.max(...withPl.map((o) => Number(o.realizedPnl))) : null;
  const worstPl = withPl.length > 0 ? Math.min(...withPl.map((o) => Number(o.realizedPnl))) : null;
  const avgPl = withPl.length > 0 ? netPl / withPl.length : null;
  const grossProfit = withPl.filter((o) => Number(o.realizedPnl) > 0).reduce((s, o) => s + Number(o.realizedPnl), 0);
  const grossLoss = Math.abs(withPl.filter((o) => Number(o.realizedPnl) <= 0).reduce((s, o) => s + Number(o.realizedPnl), 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : null;

  const stats = [
    { label: t('history.totalTrades'), value: isLoading ? '…' : String(filtered.length), sub: `${withPl.length} ${t('history.closedTrades').toLowerCase()}` },
    { label: t('history.netPl'), value: isLoading ? '…' : (withPl.length > 0 ? fmtPl(netPl, currency, lang) : '—'), colored: withPl.length > 0, positive: netPl >= 0 },
    { label: t('history.winRate'), value: isLoading ? '…' : (winRate != null ? `${winRate.toFixed(1)}%` : '—'), sub: withPl.length > 0 ? `${wins}W / ${losses}L` : t('history.noData'), colored: winRate != null, positive: (winRate ?? 0) >= 50 },
    { label: t('history.avgPl'), value: isLoading ? '…' : (avgPl != null ? fmtPl(avgPl, currency, lang) : '—'), colored: avgPl != null, positive: (avgPl ?? 0) >= 0 },
    { label: t('history.bestTrade'), value: isLoading ? '…' : (bestPl != null ? fmtPl(bestPl, currency, lang) : '—'), colored: bestPl != null, positive: true },
    { label: t('history.worstTrade'), value: isLoading ? '…' : (worstPl != null ? fmtPl(worstPl, currency, lang) : '—'), colored: worstPl != null && worstPl < 0, positive: false },
    { label: t('history.profitFactor'), value: isLoading ? '…' : (profitFactor != null ? profitFactor.toFixed(2) : '—'), sub: profitFactor != null ? (profitFactor >= 1 ? '✓' : '✗') : '', colored: profitFactor != null, positive: (profitFactor ?? 0) >= 1 },
  ];

  return (
    <>
      <BackPageHeader titleKey="history.title" />

      <div className="container mt-20">

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
          {stats.map(({ label, value, sub, colored, positive }) => (
            <div key={label} className="card" style={{ padding: '12px 14px', marginBottom: 0 }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: colored ? (positive ? '#22c55e' : '#ef4444') : undefined }}>
                {value}
              </div>
              {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>{t('common.from')}</div>
              <input ref={dateFromRef} type="date" className="form-control" style={{ padding: '6px 8px', fontSize: '0.85rem' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>{t('common.to')}</div>
              <input ref={dateToRef} type="date" className="form-control" style={{ padding: '6px 8px', fontSize: '0.85rem' }} />
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 3 }}>{t('common.symbol')}</div>
              <input ref={symbolRef} type="text" className="form-control" placeholder="EURUSD" style={{ padding: '6px 8px', fontSize: '0.85rem', width: 100 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
              <button type="button" className="btn btn-primary" style={{ padding: '7px 16px', fontSize: '0.85rem' }} onClick={applyFilters}>
                {t('common.filter')}
              </button>
              <button type="button" className="btn btn-outline-dark" style={{ padding: '7px 12px', fontSize: '0.85rem' }} onClick={handleReset}>
                {t('history.reset')}
              </button>
              <button type="button" className="btn btn-outline-dark" style={{ padding: '7px 12px', fontSize: '0.85rem' }} onClick={() => exportCsv(filtered, currency, lang)}>
                CSV ↓
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <table style={{ marginTop: 24 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>{t('history.instrument')}</th>
              <th>{t('history.openTime')}</th>
              <th>{t('history.closeTime')}</th>
              <th style={{ textAlign: 'right' }}>{t('table.openPrice')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.closePrice')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.volume')}</th>
              <th style={{ textAlign: 'right' }}>S/L</th>
              <th style={{ textAlign: 'right' }}>T/P</th>
              <th style={{ textAlign: 'right' }}>{t('table.pl')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                  {t('history.noTrades')}
                </td>
              </tr>
            ) : (
              filtered.slice(0, 300).map((trade, idx) => {
                const pl = trade.realizedPnl != null ? Number(trade.realizedPnl) : null;
                const plClass = pl == null ? '' : pl >= 0 ? 'text-success' : 'text-danger';
                return (
                  <tr key={trade.id}>
                    <td className="text-muted text-sm" style={{ width: 40 }}>{idx + 1}</td>
                    <td className="font-bold">{trade.symbolCode}</td>
                    <td className="text-sm">{fmtTime(trade.openTime, lang)}</td>
                    <td className="text-sm">{fmtTime(trade.closeTime, lang)}</td>
                    <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtPrice(trade.openPrice)}</td>
                    <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtPrice(trade.closePrice)}</td>
                    <td className="dir-ltr text-muted" style={{ textAlign: 'right' }}>{fmtQty(trade.quantity)}</td>
                    <td className="dir-ltr text-muted" style={{ textAlign: 'right' }}>{fmtPrice(trade.stopLoss)}</td>
                    <td className="dir-ltr text-muted" style={{ textAlign: 'right' }}>{fmtPrice(trade.takeProfit)}</td>
                    <td className={`dir-ltr font-bold ${plClass}`} style={{ textAlign: 'right' }}>
                      {pl != null ? `${pl >= 0 ? '+' : ''}$${Math.abs(pl).toFixed(2)}` : '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {!isLoading && withPl.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={9} className="text-muted text-sm">
                  {t('history.totalPl')} ({withPl.length}):
                </td>
                <td className={`dir-ltr font-bold ${netPl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {netPl >= 0 ? '+' : ''}${Math.abs(netPl).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </>
  );
}
