import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPostJson, getContractSize } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { usePositions, useLivePrices, useInvalidateAfterTrade, useTradeHistory, usePendingOrders, useCancelOrder, useOneClickTrading } from '@/hooks/useApi';
import type { Position, BrokerOrder } from '@/types/api';
import { pairOrders } from '@/lib/tradeUtils';

type Tab = 'open' | 'closed' | 'pending';

function fmtPrice(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v) || v === 0) return '—';
  const abs = Math.abs(v);
  // Fixed decimals within each magnitude band so live ticks don't change string length.
  const d = abs > 0 && abs < 10 ? 5 : (abs >= 10 && abs < 500 ? 3 : 2);
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPnl(n: unknown): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00';
}

function fmtQty(n: unknown): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : '0.0000';
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

/**
 * Positions Page displays active open positions, working pending orders, and closed trades history.
 * Provides tabs to switch views, search filters, order cancel triggers, and close position triggers.
 * The goal of this page is to manage the active portfolio and monitor P/L in real-time.
 *
 * @returns Positions management page layout
 */
export function PositionsPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [closing, setClosing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ position: Position } | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { data: positionsData, isLoading, error } = usePositions();
  const { data: historyData, isLoading: histLoading } = useTradeHistory();
  const { data: pendingData, isLoading: pendingLoading } = usePendingOrders();
  const { mutateAsync: cancelOrder } = useCancelOrder();
  const invalidateAfterTrade = useInvalidateAfterTrade();
  const [oneClick] = useOneClickTrading();

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
  const pendingOrders: BrokerOrder[] = (Array.isArray(pendingData) ? pendingData : [])
    .filter((o) => o.orderType !== 'CLOSE');

  const filteredOpen = activePositions.filter((p) =>
    p.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredClosed = closedTrades.filter((o) =>
    o.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );
  const filteredPending = pendingOrders.filter((o) =>
    o.symbolCode.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleCancelOrder(orderId: number, symbol: string) {
    setCancellingId(orderId);
    try {
      await cancelOrder(orderId);
      toast.show(`${symbol} — ${t('alerts.orderCancelled') || 'Order cancelled'}`, { variant: 'success' });
    } catch (err) {
      toast.show(err instanceof Error ? err.message : t('alerts.cancelFail') || 'Cancel failed', { variant: 'error' });
    } finally {
      setCancellingId(null);
    }
  }

  async function closePosition(pos: Position) {
    setClosing(pos.id);
    try {
      const res = await apiPostJson(`/api/broker/positions/${pos.id}/close`, {});
      const data = (await res.json()) as { ok: boolean; closePnl?: string; status?: string; error?: string };
      if (res.ok && data.ok) {
        const msg = t('alerts.closeOk', { symbol: pos.symbolCode }) + (data.closePnl ? ` (P/L: ${data.closePnl})` : '');
        toast.show(msg, { variant: 'success' });
        invalidateAfterTrade();
      } else {
        toast.show(t('alerts.closeFail'), { variant: 'error' });
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
        <div className="card positions-toolbar">
          {/* Tabs */}
          <div className="positions-tabs">
            {([
              { key: 'open' as Tab, label: `${t('positions.open')} (${activePositions.length})` },
              { key: 'closed' as Tab, label: `${t('positions.closed')} (${closedTrades.length})` },
              { key: 'pending' as Tab, label: `${t('positions.pending') || 'Pending'} (${pendingOrders.length})` },
            ]).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                className={`positions-tab-btn ${tab === key ? 'active' : ''}`}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            type="text"
            className="form-control positions-search-input"
            placeholder={t('common.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── OPEN POSITIONS ── */}
        {tab === 'open' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-view table-scroll">
              <table className="table-compact">
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
                      const qty = Math.abs(Number(p.quantity ?? 0));
                      const avgPrice = Number(p.avgPrice ?? 0);
                      const livePrice = livePrices[p.symbolCode.toUpperCase()];
                      const pnl = livePrice != null ? (p.side === 'SHORT' ? (avgPrice - livePrice) * qty * getContractSize(p.symbolCode) : (livePrice - avgPrice) * qty * getContractSize(p.symbolCode)) : null;
                      const isClosing = closing === p.id;
                      return (
                        <tr key={p.id}>
                          <td className="font-bold">{p.symbolCode}</td>
                          <td>
                            {p.side === 'SHORT' ? (
                              <span className="badge badge-danger">{t('badge.short')}</span>
                            ) : (
                              <span className="badge badge-success">{t('badge.long')}</span>
                            )}
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
                                {pnl >= 0 ? '+' : '-'}${fmtPnl(Math.abs(pnl))}
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
                {filteredOpen.length > 0 && (() => {
                  const totalPnl = filteredOpen.reduce((sum, p) => {
                    const qty = Math.abs(Number(p.quantity ?? 0));
                    const avg = Number(p.avgPrice ?? 0);
                    const live = livePrices[p.symbolCode.toUpperCase()];
                    if (live == null) return sum;
                    const pnl = p.side === 'SHORT' ? (avg - live) * qty * getContractSize(p.symbolCode) : (live - avg) * qty * getContractSize(p.symbolCode);
                    return sum + pnl;
                  }, 0);
                  const pnlColor = totalPnl >= 0 ? 'var(--success)' : 'var(--danger)';
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={5} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {t('table.totalPl')}
                        </td>
                        <td className="dir-ltr" style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 700, color: pnlColor }}>
                          {totalPnl >= 0 ? '+' : '-'}${fmtPnl(Math.abs(totalPnl))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  );
                })()}
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-view">
              {isLoading ? (
                <div className="text-center p-20 text-muted">{t('common.loading')}</div>
              ) : filteredOpen.length === 0 ? (
                <div className="card text-center p-20 text-muted">{t('positions.empty')}</div>
              ) : (
                filteredOpen.map((p) => {
                  const qty = Math.abs(Number(p.quantity ?? 0));
                  const avgPrice = Number(p.avgPrice ?? 0);
                  const livePrice = livePrices[p.symbolCode.toUpperCase()];
                  const pnl = livePrice != null ? (p.side === 'SHORT' ? (avgPrice - livePrice) * qty * getContractSize(p.symbolCode) : (livePrice - avgPrice) * qty * getContractSize(p.symbolCode)) : null;
                  const isClosing = closing === p.id;
                  return (
                    <div key={p.id} className="card mobile-trading-card">
                      <div className="mobile-trading-card-head">
                        <div className="mobile-trading-card-symbol">
                          <span className="font-bold text-lg">{p.symbolCode}</span>
                          <span className={`badge ${p.side === 'SHORT' ? 'badge-danger' : 'badge-success'}`}>
                            {p.side === 'SHORT' ? t('badge.short') : t('badge.long')}
                          </span>
                        </div>
                        <div className={`mobile-trading-card-pnl dir-ltr ${pnl != null && pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          {pnl != null ? `${pnl >= 0 ? '+' : '-'}$${fmtPnl(Math.abs(pnl))}` : '—'}
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="dir-ltr font-bold text-sm">{fmtQty(qty)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.openPrice')}</div>
                          <div className="dir-ltr text-sm">{fmtPrice(avgPrice)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.currentPrice')}</div>
                          <div className="dir-ltr text-sm font-bold">{livePrice != null ? fmtPrice(livePrice) : '—'}</div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-block"
                          disabled={isClosing}
                          onClick={() => { if (oneClick) void closePosition(p); else setConfirm({ position: p }); }}
                        >
                          {isClosing ? t('common.closing') : t('common.close')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── CLOSED TRADES (paired BUY+SELL) ── */}
        {tab === 'closed' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-view table-scroll">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>{t('table.symbol')}</th>
                    <th>{t('history.openTime')}</th>
                    <th>{t('history.closeTime')}</th>
                    <th style={{ textAlign: 'right' }}>{t('table.openPrice')}</th>
                    <th style={{ textAlign: 'right' }}>{t('history.closePrice')}</th>
                    <th style={{ textAlign: 'right' }}>{t('table.volume')}</th>
                    <th style={{ textAlign: 'right' }}>{t('table.stopLoss')}</th>
                    <th style={{ textAlign: 'right' }}>{t('table.takeProfit')}</th>
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
                            {pl != null ? `${pl >= 0 ? '+' : '-'}$${fmtPnl(Math.abs(pl))}` : '—'}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-view">
              {histLoading ? (
                <div className="text-center p-20 text-muted">{t('common.loading')}</div>
              ) : filteredClosed.length === 0 ? (
                <div className="card text-center p-20 text-muted">{t('history.noTrades')}</div>
              ) : (
                filteredClosed.slice(0, 100).map((trade, idx) => {
                  const pl = trade.realizedPnl != null ? Number(trade.realizedPnl) : null;
                  const plClass = pl == null ? '' : pl >= 0 ? 'text-success' : 'text-danger';
                  return (
                    <div key={trade.id} className="card mobile-trading-card">
                      <div className="mobile-trading-card-head">
                        <div className="mobile-trading-card-symbol">
                          <span className="text-muted text-xs mr-4">#{idx + 1}</span>
                          <span className="font-bold text-base">{trade.symbolCode}</span>
                        </div>
                        <div className={`mobile-trading-card-pnl dir-ltr ${plClass}`}>
                          {pl != null ? `${pl >= 0 ? '+' : '-'}$${fmtPnl(Math.abs(pl))}` : '—'}
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="dir-ltr text-sm">{fmtQty(trade.quantity)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.openPrice')}</div>
                          <div className="dir-ltr text-sm">{fmtPrice(trade.openPrice)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('history.closePrice')}</div>
                          <div className="dir-ltr text-sm">{fmtPrice(trade.closePrice)}</div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-footer text-xs text-muted flex-between">
                        <span>{fmtTime(trade.openTime)}</span>
                        <span>→ {fmtTime(trade.closeTime)}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── PENDING ORDERS ── */}
        {tab === 'pending' && (
          <>
            {/* Desktop Table View */}
            <div className="desktop-table-view table-scroll">
              <table className="table-compact">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>{t('table.symbol')}</th>
                    <th>{t('table.type')}</th>
                    <th>{t('common.side')}</th>
                    <th style={{ textAlign: 'right' }}>{t('table.volume')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.limitPrice')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.stopPrice')}</th>
                    <th className="text-sm">{t('table.createdAt')}</th>
                    <th style={{ textAlign: 'center' }}>{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoading ? (
                    <SkeletonRow />
                  ) : filteredPending.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="text-muted text-sm" style={{ padding: 24, textAlign: 'center' }}>
                        {t('positions.noPending')}
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map((o, idx) => {
                      const isCancelling = cancellingId === o.id;
                      return (
                        <tr key={o.id}>
                          <td className="text-muted text-sm" style={{ width: 40 }}>{idx + 1}</td>
                          <td className="font-bold">{o.symbolCode}</td>
                          <td>
                            <span className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                              {o.orderType}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${o.side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                              {o.side === 'BUY' ? t('badge.buy') : t('badge.sell')}
                            </span>
                          </td>
                          <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtQty(o.quantity)}</td>
                          <td className="dir-ltr" style={{ textAlign: 'right' }}>{o.orderType === 'CLOSE' ? '—' : fmtPrice(o.limitPrice)}</td>
                          <td className="dir-ltr" style={{ textAlign: 'right' }}>{fmtPrice(o.stopPrice)}</td>
                          <td className="text-sm">{fmtTime(o.createdAt)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                              disabled={isCancelling}
                              onClick={() => void handleCancelOrder(o.id, o.symbolCode)}
                            >
                              {isCancelling ? '...' : t('common.cancel')}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View */}
            <div className="mobile-cards-view">
              {pendingLoading ? (
                <div className="text-center p-20 text-muted">{t('common.loading')}</div>
              ) : filteredPending.length === 0 ? (
                <div className="card text-center p-20 text-muted">{t('positions.noPending')}</div>
              ) : (
                filteredPending.map((o, idx) => {
                  const isCancelling = cancellingId === o.id;
                  return (
                    <div key={o.id} className="card mobile-trading-card">
                      <div className="mobile-trading-card-head">
                        <div className="mobile-trading-card-symbol">
                          <span className="text-muted text-xs mr-4">#{idx + 1}</span>
                          <span className="font-bold text-base">{o.symbolCode}</span>
                          <span className={`badge ${o.side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                            {o.side === 'BUY' ? t('badge.buy') : t('badge.sell')}
                          </span>
                          <span className="badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                            {o.orderType}
                          </span>
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="dir-ltr text-sm">{fmtQty(o.quantity)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('common.limitPrice')}</div>
                          <div className="dir-ltr text-sm">{o.orderType === 'CLOSE' ? '—' : fmtPrice(o.limitPrice)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('common.stopPrice')}</div>
                          <div className="dir-ltr text-sm">{fmtPrice(o.stopPrice)}</div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-actions">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-block"
                          disabled={isCancelling}
                          onClick={() => void handleCancelOrder(o.id, o.symbolCode)}
                        >
                          {isCancelling ? '...' : t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
