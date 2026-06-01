import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPostJson } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { usePositions, useLivePrices, useInvalidateAfterTrade, useTradeHistory } from '@/hooks/useApi';
import type { Position, BrokerOrder } from '@/types/api';

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

function tsMs(iso?: string) { return iso ? new Date(iso).getTime() : 0; }

function pairOrders(orders: BrokerOrder[]): PairedTrade[] {
  const bySymbol: Record<string, { buys: BrokerOrder[]; sells: BrokerOrder[] }> = {};
  for (const o of orders) {
    if (!bySymbol[o.symbolCode]) bySymbol[o.symbolCode] = { buys: [], sells: [] };
    if (o.side === 'BUY') bySymbol[o.symbolCode].buys.push(o);
    else bySymbol[o.symbolCode].sells.push(o);
  }
  const pairs: PairedTrade[] = [];
  for (const sym of Object.keys(bySymbol)) {
    const buys = [...bySymbol[sym].buys].sort((a, b) => tsMs(a.filledAt || a.createdAt) - tsMs(b.filledAt || b.createdAt));
    const sells = [...bySymbol[sym].sells].sort((a, b) => tsMs(a.filledAt || a.createdAt) - tsMs(b.filledAt || b.createdAt));
    sells.forEach((sell, i) => {
      const buy = buys[i];
      pairs.push({ id: sell.id, symbolCode: sym, quantity: sell.quantity, openTime: buy?.filledAt || buy?.createdAt, openPrice: buy?.entryPrice, closeTime: sell.filledAt || sell.createdAt, closePrice: sell.entryPrice, stopLoss: buy?.stopLoss, takeProfit: buy?.takeProfit, realizedPnl: sell.realizedPnl });
    });
  }
  return pairs.sort((a, b) => tsMs(b.closeTime) - tsMs(a.closeTime));
}

type Tab = 'open' | 'closed';

function fmtPrice(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  if (v > 1000) return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
}

function fmtQty(n: unknown): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 8 }) : '0';
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div className="card" style={{ maxWidth: 380, width: '90%', padding: 30, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ marginBottom: 24, fontSize: '1.05rem' }}>{message}</p>
        <div className="flex-gap" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-danger" onClick={onConfirm}>{confirmLabel}</button>
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}

export function PositionsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [closing, setClosing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ position: Position } | null>(null);

  const { data: positionsData, isLoading, error } = usePositions();
  const { data: historyData, isLoading: histLoading } = useTradeHistory();
  const invalidateAfterTrade = useInvalidateAfterTrade();

  useEffect(() => { document.title = t('titles.positions'); }, [t]);

  useEffect(() => {
    if (error && (error as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 1500);
    }
  }, [error, navigate, t, toast]);

  const positions = Array.isArray(positionsData) ? positionsData : [];
  const activePositions = positions.filter((p) => Number(p.quantity ?? 0) !== 0);
  const livePrices = useLivePrices(activePositions.map((p) => p.symbolCode));

  const allHistory: BrokerOrder[] = Array.isArray(historyData) ? historyData : [];
  const closedTrades = pairOrders(allHistory);

  const filteredOpen = activePositions.filter((p) =>
    p.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredClosed = closedTrades.filter((o) =>
    o.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );

  async function closePosition(pos: Position) {
    setClosing(pos.id);
    try {
      const res = await apiPostJson('/api/broker/orders', {
        side: 'SELL', symbolCode: pos.symbolCode, quantity: Number(pos.quantity), orderType: 'MARKET',
      });
      const data = (await res.json()) as { ok: boolean; fillPrice?: string; error?: string };
      if (data.ok) {
        toast.show(t('alerts.closeOk', { symbol: pos.symbolCode }) + (data.fillPrice ? ` @ ${data.fillPrice}` : ''), { variant: 'success' });
        invalidateAfterTrade();
      } else {
        toast.show(`Error: ${data.error ?? ''}`, { variant: 'error' });
      }
    } catch {
      toast.show(t('alerts.closeFail'), { variant: 'error' });
    } finally {
      setClosing(null);
    }
  }

  return (
    <>
      <BackPageHeader titleKey="positions.title" />

      {confirm && (
        <ConfirmModal
          message={t('confirm.closePosition', { symbol: confirm.position.symbolCode })}
          confirmLabel={t('common.confirm')}
          cancelLabel={t('common.cancel')}
          onConfirm={() => { const pos = confirm.position; setConfirm(null); void closePosition(pos); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div className="container mt-20">

        {/* Toolbar */}
          <div className="card flex-between" style={{ padding: '14px 20px', marginBottom: 16 }}>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {([
              { key: 'open' as Tab, label: `${t('positions.open')} (${activePositions.length})` },
              { key: 'closed' as Tab, label: `${t('positions.closed')} (${closedTrades.length})` },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                style={{
                  padding: '8px 20px',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  fontWeight: tab === key ? 700 : 400,
                  background: tab === key ? 'var(--primary)' : 'transparent',
                  color: tab === key ? '#fff' : 'var(--text-secondary)',
                  transition: 'all 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="form-control"
            placeholder={t('common.search')}
            style={{ padding: '7px 12px', width: 180, fontSize: '0.85rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── OPEN POSITIONS ── */}
        {tab === 'open' && (
          <table>
            <thead>
              <tr>
                <th>{t('table.symbol')}</th>
                <th>{t('table.type')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.volume')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.openPrice')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.currentPrice')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.pl')}</th>
                <th style={{ textAlign: 'center' }}>{t('table.action')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <SkeletonRow />
              ) : filteredOpen.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                    {t('positions.empty')}
                  </td>
                </tr>
              ) : (
                filteredOpen.map((p) => {
                  const qty = Number(p.quantity ?? 0);
                  const avgPrice = Number(p.avgPrice ?? 0);
                  const livePrice = livePrices[p.symbolCode.toUpperCase()];
                  const pnl = livePrice != null ? (livePrice - avgPrice) * qty : null;
                  const isClosing = closing === p.id;
                  return (
                    <tr key={p.id}>
                      <td className="font-bold">{p.symbolCode}</td>
                      <td>
                        <span className="badge badge-success">{t('badge.buy')}</span>
                      </td>
                      <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtQty(qty)}</td>
                      <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtPrice(avgPrice)}</td>
                      <td className="dir-ltr" style={{ textAlign: 'right' }}>
                        {livePrice != null ? (
                          <span className={`font-bold ${pnl != null && pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                            {fmtPrice(livePrice)}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="dir-ltr" style={{ textAlign: 'right' }}>
                        {pnl != null ? (
                          <span className={`font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                            {pnl >= 0 ? '+' : ''}${fmtPrice(Math.abs(pnl))}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'center' }}>
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
        )}

        {/* ── CLOSED TRADES (paired BUY+SELL) ── */}
        {tab === 'closed' && (
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>{t('table.symbol')}</th>
                <th>{t('history.openTime')}</th>
                <th>{t('history.closeTime')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.openPrice')}</th>
                <th style={{ textAlign: 'right' }}>{t('history.closePrice')}</th>
                <th style={{ textAlign: 'right' }}>{t('table.volume')}</th>
                <th style={{ textAlign: 'right' }}>S/L</th>
                <th style={{ textAlign: 'right' }}>T/P</th>
                <th style={{ textAlign: 'right' }}>{t('table.pl')}</th>
              </tr>
            </thead>
            <tbody>
              {histLoading ? (
                <SkeletonRow />
              ) : filteredClosed.length === 0 ? (
                <tr>
                  <td colSpan={10} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                    {t('history.noTrades')}
                  </td>
                </tr>
              ) : (
                filteredClosed.slice(0, 200).map((trade, idx) => {
                  const pl = trade.realizedPnl != null ? Number(trade.realizedPnl) : null;
                  const plClass = pl == null ? '' : pl >= 0 ? 'text-success' : 'text-danger';
                  return (
                    <tr key={trade.id}>
                      <td className="text-muted text-sm" style={{ width: 40 }}>{idx + 1}</td>
                      <td className="font-bold">{trade.symbolCode}</td>
                      <td className="text-sm">{fmtTime(trade.openTime)}</td>
                      <td className="text-sm">{fmtTime(trade.closeTime)}</td>
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
          </table>
        )}
      </div>
    </>
  );
}
