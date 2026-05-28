import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, useTradeHistory } from '@/hooks/useApi';
import type { BrokerOrder } from '@/types/api';

function fmtMoney(n: unknown, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));
}

function fmtPrice(n: unknown): string {
  if (n == null) return '—';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 8, minimumFractionDigits: 2 });
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

function exportCsv(trades: BrokerOrder[]) {
  const headers = ['ID', 'Open Time', 'Close Time', 'Symbol', 'Side', 'Quantity', 'Entry Price', 'P/L'];
  const rows = trades.map((o) => [
    o.id,
    o.createdAt ? new Date(o.createdAt).toISOString() : '',
    o.filledAt ? new Date(o.filledAt).toISOString() : '',
    o.symbolCode,
    o.side,
    o.quantity,
    o.entryPrice ?? '',
    o.realizedPnl ?? '',
  ]);
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `trade-history-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function HistoryPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [filtered, setFiltered] = useState<BrokerOrder[]>([]);

  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);
  const symbolRef = useRef<HTMLInputElement>(null);

  const { data: overview, error: overviewError } = useBrokerOverview();
  const { data: historyData, isLoading } = useTradeHistory();

  useEffect(() => {
    document.title = t('titles.history');
  }, [t]);

  useEffect(() => {
    if (overviewError && (overviewError as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 800);
    }
  }, [overviewError, navigate, t, toast]);

  const allTrades = Array.isArray(historyData) ? historyData : [];
  const currency = overview?.currency || 'USD';

  useEffect(() => {
    setFiltered(allTrades);
  }, [historyData]);

  function applyFilters() {
    let result = [...allTrades];
    const from = dateFromRef.current?.value;
    const to = dateToRef.current?.value;
    const sym = symbolRef.current?.value.trim().toUpperCase();

    if (from) {
      const fromMs = new Date(from).getTime();
      result = result.filter((o) => o.filledAt && new Date(o.filledAt).getTime() >= fromMs);
    }
    if (to) {
      const toMs = new Date(to + 'T23:59:59').getTime();
      result = result.filter((o) => o.filledAt && new Date(o.filledAt).getTime() <= toMs);
    }
    if (sym) {
      result = result.filter((o) => o.symbolCode.toUpperCase().includes(sym));
    }
    setFiltered(result);
  }

  function handleExport() {
    if (!filtered.length) {
      toast.show(t('alerts.comingSoon'), { variant: 'info' });
      return;
    }
    exportCsv(filtered);
  }

  const sellTrades = filtered.filter((o) => o.side === 'SELL' && o.realizedPnl != null);
  const netPl = sellTrades.reduce((s, o) => s + Number(o.realizedPnl ?? 0), 0);
  const wins = sellTrades.filter((o) => Number(o.realizedPnl ?? 0) > 0).length;
  const winRate = sellTrades.length > 0 ? (wins / sellTrades.length) * 100 : 0;
  const totalVol = filtered.reduce((s, o) => s + Number(o.quantity ?? 0), 0);

  return (
    <>
      <BackPageHeader titleKey="history.title" />

      <div className="container mt-20">
        <div
          className="card flex-gap text-left"
          style={{ alignItems: 'center', justifyContent: 'flex-start', padding: 15, flexWrap: 'wrap' }}
        >
          <div className="form-group mb-0">
            <label style={{ margin: '0 0 5px 0' }}>{t('common.from')}</label>
            <input ref={dateFromRef} type="date" className="form-control" style={{ padding: 8 }} />
          </div>
          <div className="form-group mb-0">
            <label style={{ margin: '0 0 5px 0' }}>{t('common.to')}</label>
            <input ref={dateToRef} type="date" className="form-control" style={{ padding: 8 }} />
          </div>
          <div className="form-group mb-0">
            <label style={{ margin: '0 0 5px 0' }}>{t('common.symbol')}</label>
            <input
              ref={symbolRef}
              type="text"
              className="form-control"
              placeholder={t('history.placeholderSymbol')}
              style={{ padding: 8 }}
            />
          </div>
          <div className="flex-gap" style={{ marginTop: 25 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: '10px 25px' }}
              onClick={applyFilters}
            >
              {t('common.filter')}
            </button>
            <button
              type="button"
              className="btn btn-outline-dark"
              style={{ padding: '10px 25px' }}
              onClick={handleExport}
            >
              {t('history.export')}
            </button>
          </div>
        </div>

        <div className="stats-grid mb-20" style={{ marginBottom: 30 }}>
          <div className="card stat-card mb-0">
            <div className="label text-secondary text-sm">{t('history.totalTrades')}</div>
            <div className="value font-bold text-primary text-xl">
              {isLoading ? '…' : filtered.length}
            </div>
          </div>
          <div className="card stat-card mb-0">
            <div className="label text-secondary text-sm">{t('history.netPl')}</div>
            <div className={`value font-bold text-xl ${netPl >= 0 ? 'text-success' : 'text-danger'}`}>
              {isLoading ? '…' : `${netPl >= 0 ? '+' : ''}${fmtMoney(netPl, currency)}`}
            </div>
          </div>
          <div className="card stat-card mb-0">
            <div className="label text-secondary text-sm">{t('history.winRate')}</div>
            <div className="value text-primary font-bold text-xl">
              {isLoading ? '…' : `${winRate.toFixed(1)}%`}
            </div>
          </div>
          <div className="card stat-card mb-0">
            <div className="label text-secondary text-sm">{t('history.totalVol')}</div>
            <div className="value text-primary font-bold text-xl">
              {isLoading ? '…' : totalVol.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="card text-left">
          <h3
            className="mb-20 text-xl font-bold"
            style={{ paddingBottom: 10, borderBottom: '2px solid var(--border-light)' }}
          >
            {t('history.closedOrders')}
          </h3>
          <table className="mt-20">
            <thead>
              <tr>
                <th>{t('history.ticket')}</th>
                <th>{t('history.openTime')}</th>
                <th>{t('history.closeTime')}</th>
                <th>{t('table.symbol')}</th>
                <th>{t('history.direction')}</th>
                <th>{t('history.lots')}</th>
                <th>{t('table.openPrice')}</th>
                <th>{t('history.closePrice')}</th>
                <th>{t('history.plUsd')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRow />
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                    {t('history.noTrades')}
                  </td>
                </tr>
              ) : (
                filtered.slice(0, 200).map((o) => {
                  const pl = Number(o.realizedPnl ?? 0);
                  const hasPl = o.realizedPnl != null;
                  const plText = hasPl
                    ? `${pl >= 0 ? '+' : ''}${fmtMoney(pl, currency)}`
                    : '—';
                  const plClass = hasPl ? (pl >= 0 ? 'text-success' : 'text-danger') : 'text-muted';

                  return (
                    <tr key={o.id}>
                      <td className="text-sm dir-ltr">#{o.id}</td>
                      <td className="text-sm">{fmtTime(o.createdAt)}</td>
                      <td className="text-sm">{fmtTime(o.filledAt)}</td>
                      <td className="font-bold">{o.symbolCode}</td>
                      <td>
                        <span className={`badge ${o.side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                          {o.side}
                        </span>
                      </td>
                      <td>{Number(o.quantity ?? 0).toFixed(4)}</td>
                      <td className="dir-ltr">{fmtPrice(o.entryPrice)}</td>
                      <td className="dir-ltr text-muted">—</td>
                      <td className={`dir-ltr font-bold ${plClass}`}>{plText}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
