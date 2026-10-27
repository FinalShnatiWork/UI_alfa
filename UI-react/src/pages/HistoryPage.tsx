import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, useTradeHistory } from '@/hooks/useApi';
import type { BrokerOrder } from '@/types/api';
import { pairOrders, tsMs as ts } from '@/lib/tradeUtils';
import type { PairedTrade } from '@/lib/tradeUtils';
import { fmtCsvDateTime, fmtDateTime, fmtLots, fmtMoney, fmtPrice, fmtSignedMoney } from '@/lib/format';
import { downloadCsv } from '@/lib/csv';

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtTime = fmtDateTime;

function fmtQty(n: unknown): string {
  return n == null ? '—' : fmtLots(n);
}

function fmtPl(n: unknown, currency: string): string {
  return n == null ? '—' : fmtSignedMoney(n, currency);
}

function numOrBlank(value: unknown, keepZero = false): number | '' {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n) || (!keepZero && n === 0)) return '';
  return n;
}

function exportCsv(trades: PairedTrade[], t: (key: string) => string) {
  const headers = [
    '#',
    t('table.symbol'),
    t('history.volume'),
    t('history.openTime'),
    t('table.openPrice'),
    t('history.closeTime'),
    t('history.closePrice'),
    t('table.stopLoss'),
    t('table.takeProfit'),
    t('history.commission'),
    t('table.pl'),
  ];
  const rows = trades.map((t) => [
    t.id,
    t.symbolCode,
    numOrBlank(t.quantity, true),
    fmtCsvDateTime(t.openTime),
    numOrBlank(t.openPrice),
    fmtCsvDateTime(t.closeTime),
    numOrBlank(t.closePrice),
    numOrBlank(t.stopLoss),
    numOrBlank(t.takeProfit),
    numOrBlank(t.commission, true),
    t.realizedPnl != null ? numOrBlank(t.realizedPnl, true) : '',
  ]);
  downloadCsv('history', headers, rows);
}

interface HistoryFilter {
  from: string;
  to: string;
  symbol: string;
}

const NO_FILTER: HistoryFilter = { from: '', to: '', symbol: '' };

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
  const [filter, setFilter] = useState<HistoryFilter>(NO_FILTER);

  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);

  const { data: overview } = useBrokerOverview();
  const { data: historyData, isLoading } = useTradeHistory();

  const currency = overview?.currency || 'USD';

  useEffect(() => { document.title = t('titles.history'); }, [t]);

  const allOrders: BrokerOrder[] = Array.isArray(historyData) ? historyData : [];
  const allPairs = pairOrders(allOrders);

  const symFilter = filter.symbol.trim().toUpperCase();
  const fromMs = filter.from ? new Date(filter.from).getTime() : null;
  const toMs = filter.to ? new Date(filter.to + 'T23:59:59').getTime() : null;
  const filtered = allPairs.filter((o) =>
    (fromMs == null || ts(o.closeTime) >= fromMs)
    && (toMs == null || ts(o.closeTime) <= toMs)
    && (!symFilter || o.symbolCode.toUpperCase().includes(symFilter)));

  function applyFilters() {
    setFilter({
      from: dateFromRef.current?.value ?? '',
      to: dateToRef.current?.value ?? '',
      symbol: symbolRef.current?.value ?? '',
    });
  }

  function handleReset() {
    if (dateFromRef.current) dateFromRef.current.value = '';
    if (dateToRef.current) dateToRef.current.value = '';
    if (symbolRef.current) symbolRef.current.value = '';
    setFilter(NO_FILTER);
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
    { label: t('history.grossPl'), value: isLoading ? '…' : (withPl.length > 0 ? fmtPl(grossTradePl, currency) : '—'), colored: withPl.length > 0, positive: grossTradePl >= 0, sub: t('history.beforeFees') },
    { label: t('history.commissionPaid'), value: isLoading ? '…' : (filtered.length > 0 ? `−${fmtMoney(commissionTotal, currency)}` : '—'), colored: filtered.length > 0, positive: false, sub: t('history.totalFeesDeducted') },
    { label: t('history.netPl'), value: isLoading ? '…' : (withPl.length > 0 ? fmtPl(netPl, currency) : '—'), colored: withPl.length > 0, positive: netPl >= 0, sub: t('history.finalNetResult') },
    { label: t('history.winRate'), value: isLoading ? '…' : (winRate != null ? `${winRate.toFixed(1)}%` : '—'), sub: withPl.length > 0 ? `${wins}W / ${losses}L` : t('history.noData'), colored: winRate != null, positive: (winRate ?? 0) >= 50 },
    { label: t('history.avgPl'), value: isLoading ? '…' : (avgPl != null ? fmtPl(avgPl, currency) : '—'), colored: avgPl != null, positive: (avgPl ?? 0) >= 0 },
    { label: t('history.bestTrade'), value: isLoading ? '…' : (bestPl != null ? fmtPl(bestPl, currency) : '—'), colored: bestPl != null, positive: true },
    { label: t('history.worstTrade'), value: isLoading ? '…' : (worstPl != null ? fmtPl(worstPl, currency) : '—'), colored: worstPl != null && worstPl < 0, positive: false },
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
                <bdi dir="ltr">{value}</bdi>
              </div>
              {sub && <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', marginTop: 1 }}>{sub}</div>}
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
          <div className="history-filters-bar">
            <div>
              <div className="mini-label mb3" >{t('common.from')}</div>
              <input ref={dateFromRef} type="date" className="form-control" style={{ padding: '6px 8px', fontSize: '0.85rem' }} />
            </div>
            <div>
              <div className="mini-label mb3" >{t('common.to')}</div>
              <input ref={dateToRef} type="date" className="form-control" style={{ padding: '6px 8px', fontSize: '0.85rem' }} />
            </div>
            <div>
              <div className="mini-label mb3" >{t('common.symbol')}</div>
              <input ref={symbolRef} type="text" className="form-control" placeholder="EURUSD" style={{ padding: '6px 8px', fontSize: '0.85rem', width: 100 }} />
            </div>
            <div style={{ display: 'flex', gap: 6, paddingBottom: 1 }}>
              <button type="button" className="btn btn-primary" style={{ padding: '7px 16px', fontSize: '0.85rem' }} onClick={applyFilters}>
                {t('common.filter')}
              </button>
              <button type="button" className="btn-compact btn btn-outline-dark"  onClick={handleReset}>
                {t('history.reset')}
              </button>
              <button type="button" className="btn-compact btn btn-outline-dark"  onClick={() => exportCsv(filtered, t)}>
                {t('finance.exportCsv')}
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-scroll">
        <table className="table-compact table-stack" style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th className="col-idx" >#</th>
              <th>{t('history.instrument')}</th>
              <th>{t('history.openTime')}</th>
              <th>{t('history.closeTime')}</th>
              <th className="align-right" >{t('table.openPrice')}</th>
              <th className="align-right" >{t('history.closePrice')}</th>
              <th className="align-right" >{t('history.volume')}</th>
              <th className="align-right" >{t('table.stopLoss')}</th>
              <th className="align-right" >{t('table.takeProfit')}</th>
              <th className="align-right" >{t('history.grossPl')}</th>
              <th className="align-right" >{t('history.commission')}</th>
              <th className="align-right" >{t('history.netPl')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={12} className="empty-note text-muted text-sm" >
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
                    <td className="col-idx text-muted text-sm stack-hide" >{idx + 1}</td>
                    <td className="font-bold stack-head">{trade.symbolCode}</td>
                    <td className="text-sm" data-label={t('history.openTime')}><bdi>{fmtTime(trade.openTime, lang)}</bdi></td>
                    <td className="text-sm" data-label={t('history.closeTime')}><bdi>{fmtTime(trade.closeTime, lang)}</bdi></td>
                    <td className="align-right dir-ltr"  data-label={t('table.openPrice')}>{fmtPrice(trade.openPrice)}</td>
                    <td className="align-right dir-ltr"  data-label={t('history.closePrice')}>{fmtPrice(trade.closePrice)}</td>
                    <td className="align-right dir-ltr text-muted"  data-label={t('history.volume')}>{fmtQty(trade.quantity)}</td>
                    <td className="align-right dir-ltr text-muted"  data-label={t('table.stopLoss')}>{fmtPrice(trade.stopLoss)}</td>
                    <td className="align-right dir-ltr text-muted"  data-label={t('table.takeProfit')}>{fmtPrice(trade.takeProfit)}</td>
                    <td className="dir-ltr" style={{ textAlign: 'right', fontWeight: 600, color: grossPl != null ? (grossPl >= 0 ? 'var(--green)' : 'var(--red)') : 'inherit' }} data-label={t('history.grossPl')}>
                      {grossPl != null ? fmtPl(grossPl, currency) : '—'}
                    </td>
                    <td className="align-right dir-ltr text-muted"  data-label={t('history.commission')}>
                      {trade.commission != null ? `−${fmtMoney(trade.commission, currency)}` : '—'}
                    </td>
                    <td className={`align-right dir-ltr font-bold stack-pl ${plClass}`}  data-label={t('history.netPl')}>
                      {pl != null ? fmtPl(pl, currency) : '—'}
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
                <td className={`dir-ltr font-bold ${grossTradePl >= 0 ? 'text-success' : 'text-danger'}`} data-label={t('history.grossPl')}>
                  {fmtPl(grossTradePl, currency)}
                </td>
                <td className="dir-ltr font-bold text-danger" data-label={t('history.commission')}>
                  −{fmtMoney(commissionTotal, currency)}
                </td>
                <td className={`dir-ltr font-bold ${netPl >= 0 ? 'text-success' : 'text-danger'}`} data-label={t('history.netPl')}>
                  {fmtPl(netPl, currency)}
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
