import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPostJson } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { usePositions } from '@/hooks/useApi';
import type { Position } from '@/types/api';

type Filter = 'open' | 'closed' | 'pending';

function fmtPrice(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '—';
  if (v > 1000)
    return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtQty(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  return v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 });
}

interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel: string;
  cancelLabel: string;
}

function ConfirmModal({ message, onConfirm, onCancel, confirmLabel, cancelLabel }: ConfirmModalProps) {
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        style={{ maxWidth: 380, width: '90%', padding: 30, textAlign: 'center' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ marginBottom: 24, fontSize: '1.05rem' }}>{message}</p>
        <div className="flex-gap" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PositionsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<Filter>('open');
  const [search, setSearch] = useState('');
  const [closing, setClosing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ position: Position } | null>(null);

  const { data: positionsData, isLoading, error, refetch } = usePositions();

  useEffect(() => {
    document.title = t('titles.positions');
  }, [t]);

  useEffect(() => {
    if (error && (error as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 1500);
    }
  }, [error, navigate, t, toast]);

  const positions = Array.isArray(positionsData) ? positionsData : [];

  useEffect(() => {
    if (positions.length === 0) return;
    const active = positions.filter((p) => Number(p.quantity ?? 0) !== 0);
    const symbols = [...new Set(active.map((p) => p.symbolCode))];

    void Promise.all(
      symbols.map(async (sym) => {
        try {
          const data = await apiGet<{ price: number }>(`/api/market/price/${encodeURIComponent(sym)}`);
          return [sym, data?.price != null ? Number(data.price) : null] as const;
        } catch {
          return [sym, null] as const;
        }
      }),
    ).then((entries) => {
      const prices: Record<string, number> = {};
      for (const [sym, price] of entries) {
        if (price != null) prices[sym] = price;
      }
      setLivePrices(prices);
    });
  }, [positionsData]);

  async function closePosition(pos: Position) {
    setClosing(pos.id);
    try {
      const res = await apiPostJson('/api/broker/orders', {
        side: 'SELL',
        symbolCode: pos.symbolCode,
        quantity: Number(pos.quantity),
        orderType: 'MARKET',
      });
      const data = (await res.json()) as { ok: boolean; fillPrice?: string; error?: string };
      if (data.ok) {
        toast.show(
          t('alerts.closeOk', { symbol: pos.symbolCode }) +
            (data.fillPrice ? ` @ ${data.fillPrice}` : ''),
          { variant: 'success' },
        );
        void refetch();
      } else {
        toast.show(`Error: ${data.error ?? ''}`, { variant: 'error' });
      }
    } catch {
      toast.show(t('alerts.closeFail'), { variant: 'error' });
    } finally {
      setClosing(null);
    }
  }

  const activePositions = positions.filter((p) => Number(p.quantity ?? 0) !== 0);
  const filtered = activePositions.filter((p) =>
    p.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );

  const FILTERS: { key: Filter; labelKey: string }[] = [
    { key: 'open', labelKey: 'positions.open' },
    { key: 'closed', labelKey: 'positions.closed' },
    { key: 'pending', labelKey: 'positions.pending' },
  ];

  return (
    <>
      <BackPageHeader titleKey="positions.title" />

      {confirm && (
        <ConfirmModal
          message={t('confirm.closePosition', { symbol: confirm.position.symbolCode })}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => {
            const pos = confirm.position;
            setConfirm(null);
            void closePosition(pos);
          }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="container mt-20">
        <div className="card flex-between" style={{ padding: '15px 20px' }}>
          <div className="flex-gap">
            {FILTERS.map(({ key, labelKey }) => (
              <button
                key={key}
                type="button"
                className={`btn ${filter === key ? 'btn-primary' : 'btn-outline-dark'}`}
                onClick={() => setFilter(key)}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
          <div>
            <input
              type="text"
              className="form-control"
              placeholder={t('common.search')}
              style={{ padding: 8 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <table className="positions-table">
          <thead>
            <tr>
              <th>{t('table.symbol')}</th>
              <th className="center">{t('table.type')}</th>
              <th className="num">{t('table.volume')}</th>
              <th className="num">{t('table.openPrice')}</th>
              <th className="num">{t('table.currentPrice')}</th>
              <th>{t('table.pl')}</th>
              <th className="center">{t('table.action')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRow />
            ) : filter !== 'open' || filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-muted text-sm" style={{ textAlign: 'center', padding: '2rem' }}>
                  {filter !== 'open' ? t('alerts.comingSoon') : t('positions.empty')}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const qty = Number(p.quantity ?? 0);
                const avgPrice = Number(p.avgPrice ?? 0);
                const livePrice = livePrices[p.symbolCode];
                const pnl = livePrice != null ? (livePrice - avgPrice) * qty : null;
                const isClosing = closing === p.id;

                return (
                  <tr key={p.id}>
                    <td>
                      <strong className="font-bold">{p.symbolCode}</strong>
                    </td>
                    <td className="center">
                      <span className={`badge ${qty >= 0 ? 'badge-success' : 'badge-danger'}`}>
                        {qty >= 0 ? t('badge.buy') : t('badge.sell')}
                      </span>
                    </td>
                    <td className="num">{fmtQty(qty)}</td>
                    <td className="num">{fmtPrice(avgPrice)}</td>
                    <td className="num">
                      {livePrice != null ? (
                        <span className={`font-bold ${pnl != null && pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          {fmtPrice(livePrice)}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td>
                      {pnl != null ? (
                        <span className={`font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          {pnl >= 0 ? '+' : ''}${fmtPrice(Math.abs(pnl))}
                        </span>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="center">
                      <button
                        type="button"
                        className="btn btn-danger"
                        style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                        disabled={isClosing}
                        onClick={() => setConfirm({ position: p })}
                      >
                        {isClosing ? t('common.closing') : t('common.close')}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
