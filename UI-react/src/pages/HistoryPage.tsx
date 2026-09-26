import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, useTradeHistory } from '@/hooks/useApi';
import type { BrokerOrder } from '@/types/api';
import { pairOrders, tsMs as ts } from '@/lib/tradeUtils';
import type { PairedTrade } from '@/lib/tradeUtils';

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
  const abs = Math.abs(v);
  const d = abs > 0 && abs < 10 ? 5 : (abs >= 10 && abs < 500 ? 3 : 2);
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
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
  const headers = ['#', 'Symbol', 'Volume', 'Open Time', 'Open Price', 'Close Time', 'Close Price', 'S/L', 'T/P', 'Commission', 'P/L'];
  const rows = trades.map((t) => [
    t.id, t.symbolCode, fmtQty(t.quantity),
    fmtTime(t.openTime, locale), fmtPrice(t.openPrice),
    fmtTime(t.closeTime, locale), fmtPrice(t.closePrice),
    fmtPrice(t.stopLoss), fmtPrice(t.takeProfit),
    t.commission != null ? `-$${Number(t.commission).toFixed(2)}` : '',
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

/**
 * History Page displaying closed paired trades and ledger metrics.
 * Provides custom date range and asset filters, win-rate metrics, CSV exports,
 * and lists details of closed positions (entry price, close price, realized P/L).
 * The goal of this page is to summarize user trade execution performance over time.
 *
 * @returns History page view layout
 */
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
  const commissionTotal = filtered.reduce((s, o) => s + Number(o.commission ?? 0), 0);
  const grossTradePl = withPl.reduce((s, o) => s + (Number(o.realizedPnl) + Number(o.commission ?? 0)), 0);

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
    { label: t('history.grossPl'), value: isLoading ? '…' : (withPl.length > 0 ? fmtPl(grossTradePl, currency, lang) : '—'), colored: withPl.length > 0, positive: grossTradePl >= 0, sub: t('history.beforeFees') },
    { label: t('history.commissionPaid'), value: isLoading ? '…' : (filtered.length > 0 ? `−$${commissionTotal.toFixed(2)}` : '—'), colored: filtered.length > 0, positive: false, sub: t('history.totalFeesDeducted') },
    { label: t('history.netPl'), value: isLoading ? '…' : (withPl.length > 0 ? fmtPl(netPl, currency, lang) : '—'), colored: withPl.length > 0, positive: netPl >= 0, sub: t('history.finalNetResult') },
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
        <div className="table-scroll">
        <table className="table-compact" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ width: 40 }}>#</th>
              <th>{t('history.instrument')}</th>
              <th>{t('history.openTime')}</th>
              <th>{t('history.closeTime')}</th>
              <th style={{ textAlign: 'right' }}>{t('table.openPrice')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.closePrice')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.volume')}</th>
              <th style={{ textAlign: 'right' }}>{t('table.stopLoss')}</th>
              <th style={{ textAlign: 'right' }}>{t('table.takeProfit')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.grossPl')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.commission')}</th>
              <th style={{ textAlign: 'right' }}>{t('history.netPl')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                  {t('history.noTrades')}
                </td>
              </tr>
            ) : (
              filtered.slice(0, 300).map((trade, idx) => {
                const pl = trade.realizedPnl != null ? Number(trade.realizedPnl) : null;
                const grossPl = pl != null ? pl + Number(trade.commission ?? 0) : null;
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
                    <td className="dir-ltr" style={{ textAlign: 'right', fontWeight: 600, color: grossPl != null ? (grossPl >= 0 ? 'var(--text-success)' : 'var(--text-danger)') : 'inherit' }}>
                      {grossPl != null ? fmtPl(grossPl, currency, lang) : '—'}
                    </td>
                    <td className="dir-ltr text-muted" style={{ textAlign: 'right' }}>
                      {trade.commission != null ? `−$${Number(trade.commission).toFixed(2)}` : '—'}
                    </td>
                    <td className={`dir-ltr font-bold ${plClass}`} style={{ textAlign: 'right' }}>
                      {pl != null ? `${pl >= 0 ? '+' : '-'}$${Math.abs(pl).toFixed(2)}` : '—'}
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
                <td className={`dir-ltr font-bold ${grossTradePl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {fmtPl(grossTradePl, currency, lang)}
                </td>
                <td className="dir-ltr font-bold text-danger">
                  −${commissionTotal.toFixed(2)}
                </td>
                <td className={`dir-ltr font-bold ${netPl >= 0 ? 'text-success' : 'text-danger'}`}>
                  {fmtPl(netPl, currency, lang)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </>
  );
}
