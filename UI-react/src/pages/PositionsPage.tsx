import { useEffect, useState } from 'react';
import { apiPostJson } from '@/lib/api';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { ConfirmModal } from '@/components/ConfirmModal';
import { usePositions, useLivePrices, useInvalidateAfterTrade, useTradeHistory, usePendingOrders, useCancelOrder, useOneClickTrading, useBrokerOverview } from '@/hooks/useApi';
import type { Position, BrokerOrder } from '@/types/api';
import { livePriceFor, pairOrders, positionPnl } from '@/lib/tradeUtils';
import { fmtDateTime, fmtLots, fmtPrice, fmtSignedMoney } from '@/lib/format';

type Tab = 'open' | 'closed' | 'pending';

const fmtQty = (n: unknown) => fmtLots(n);

/**
 * Positions Page displays active open positions, working pending orders, and closed trades history.
 * Provides tabs to switch views, search filters, order cancel triggers, and close position triggers.
 * The goal of this page is to manage the active portfolio and monitor P/L in real-time.
 *
 * @returns Positions management page layout
 */
export function PositionsPage() {
  const { t, lang } = useI18n();
  const isRtl = lang === 'he';
  const fmtTime = (iso: string | undefined) => fmtDateTime(iso, lang);
  const { data: overview } = useBrokerOverview();
  const currency = overview?.currency || 'USD';
  const toast = useToast();

  const [tab, setTab] = useState<Tab>('open');
  const [search, setSearch] = useState('');
  const [closing, setClosing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<{ message: string; run: () => void } | null>(null);
  const [cancellingId, setCancellingId] = useState<number | null>(null);

  const { data: positionsData, isLoading } = usePositions();
  const { data: historyData, isLoading: histLoading } = useTradeHistory();
  const { data: pendingData, isLoading: pendingLoading } = usePendingOrders();
  const { mutateAsync: cancelOrder } = useCancelOrder();
  const invalidateAfterTrade = useInvalidateAfterTrade();
  const [oneClick] = useOneClickTrading();

  useEffect(() => { document.title = t('titles.positions'); }, [t]);

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
        const msg = t('alerts.closeOk', { symbol: pos.symbolCode }) + (data.closePnl ? ` (${fmtSignedMoney(data.closePnl, currency)})` : '');
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
          message={confirm.message}
          onConfirm={() => { const c = confirm; setConfirm(null); c.run(); }}
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
                    <th className="align-right" >{t('table.volume')}</th>
                    <th className="align-right" >{t('table.openPrice')}</th>
                    <th className="align-right" >{t('table.currentPrice')}</th>
                    <th className="align-right" >{t('table.pl')}</th>
                    <th className="text-center" >{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <SkeletonRow />
                  ) : filteredOpen.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-note text-muted text-sm" >
                        {t('positions.empty')}
                      </td>
                    </tr>
                  ) : (
                    filteredOpen.map((p) => {
                      const qty = Math.abs(Number(p.quantity ?? 0));
                      const avgPrice = Number(p.avgPrice ?? 0);
                      const livePrice = livePriceFor(livePrices, p.symbolCode);
                      const pnl = positionPnl(p, livePrice, livePrices);
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
                          <td className="align-right dir-ltr" >{fmtQty(qty)}</td>
                          <td className="align-right dir-ltr" >{fmtPrice(avgPrice)}</td>
                          <td className="align-right dir-ltr" >
                            {livePrice != null ? (
                              <span className={`font-bold ${pnl != null && pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                                {fmtPrice(livePrice)}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="align-right dir-ltr" >
                            <span className={`font-bold ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                              {fmtSignedMoney(pnl, currency)}
                            </span>
                          </td>
                          <td className="text-center" >
                            <button
                              type="button"
                              className="btn btn-danger"
                              style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                              disabled={isClosing}
                              onClick={() => { if (oneClick) void closePosition(p); else setConfirm({ message: t('confirm.closePosition', { symbol: p.symbolCode }), run: () => void closePosition(p) }); }}
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
                  const totalPnl = filteredOpen.reduce(
                    (sum, p) => sum + positionPnl(p, livePriceFor(livePrices, p.symbolCode), livePrices), 0);
                  const pnlColor = totalPnl >= 0 ? 'var(--green)' : 'var(--red)';
                  return (
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={5} style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                          {t('table.totalPl')}
                        </td>
                        <td className="dir-ltr" style={{ textAlign: 'right', padding: '10px 8px', fontWeight: 700, color: pnlColor }}>
                          {fmtSignedMoney(totalPnl, currency)}
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
                  const livePrice = livePriceFor(livePrices, p.symbolCode);
                  const pnl = positionPnl(p, livePrice, livePrices);
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
                        <div className={`mobile-trading-card-pnl ${pnl >= 0 ? 'text-success' : 'text-danger'}`}>
                          <bdi dir="ltr" className="dir-ltr">{fmtSignedMoney(pnl, currency)}</bdi>
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="font-bold text-sm"><bdi dir="ltr" className="dir-ltr">{fmtQty(qty)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.openPrice')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtPrice(avgPrice)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.currentPrice')}</div>
                          <div className="text-sm font-bold"><bdi dir="ltr" className="dir-ltr">{livePrice != null ? fmtPrice(livePrice) : '—'}</bdi></div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-actions">
                        <button
                          type="button"
                          className="btn btn-danger btn-block"
                          disabled={isClosing}
                          onClick={() => { if (oneClick) void closePosition(p); else setConfirm({ message: t('confirm.closePosition', { symbol: p.symbolCode }), run: () => void closePosition(p) }); }}
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
                    <th className="col-idx" >#</th>
                    <th>{t('table.symbol')}</th>
                    <th>{t('history.openTime')}</th>
                    <th>{t('history.closeTime')}</th>
                    <th className="align-right" >{t('table.openPrice')}</th>
                    <th className="align-right" >{t('history.closePrice')}</th>
                    <th className="align-right" >{t('table.volume')}</th>
                    <th className="align-right" >{t('table.stopLoss')}</th>
                    <th className="align-right" >{t('table.takeProfit')}</th>
                    <th className="align-right" >{t('table.pl')}</th>
                  </tr>
                </thead>
                <tbody>
                  {histLoading ? (
                    <SkeletonRow />
                  ) : filteredClosed.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="empty-note text-muted text-sm" >
                        {t('history.noTrades')}
                      </td>
                    </tr>
                  ) : (
                    filteredClosed.slice(0, 200).map((trade, idx) => {
                      const pl = trade.realizedPnl != null ? Number(trade.realizedPnl) : null;
                      const plClass = pl == null ? '' : pl >= 0 ? 'text-success' : 'text-danger';
                      return (
                        <tr key={trade.id}>
                          <td className="col-idx text-muted text-sm" >{idx + 1}</td>
                          <td className="font-bold">{trade.symbolCode}</td>
                          <td className="text-sm"><bdi>{fmtTime(trade.openTime)}</bdi></td>
                          <td className="text-sm"><bdi>{fmtTime(trade.closeTime)}</bdi></td>
                          <td className="align-right dir-ltr" >{fmtPrice(trade.openPrice)}</td>
                          <td className="align-right dir-ltr" >{fmtPrice(trade.closePrice)}</td>
                          <td className="align-right dir-ltr text-muted" >{fmtQty(trade.quantity)}</td>
                          <td className="align-right dir-ltr text-muted" >{fmtPrice(trade.stopLoss)}</td>
                          <td className="align-right dir-ltr text-muted" >{fmtPrice(trade.takeProfit)}</td>
                          <td className={`align-right dir-ltr font-bold ${plClass}`} >
                            {pl != null ? fmtSignedMoney(pl, currency) : '—'}
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
                        <div className={`mobile-trading-card-pnl ${plClass}`}>
                          <bdi dir="ltr" className="dir-ltr">{pl != null ? fmtSignedMoney(pl, currency) : '—'}</bdi>
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtQty(trade.quantity)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('table.openPrice')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtPrice(trade.openPrice)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('history.closePrice')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtPrice(trade.closePrice)}</bdi></div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-footer text-xs text-muted flex-between">
                        <span><bdi>{fmtTime(trade.openTime)}</bdi></span>
                        <span>{isRtl ? '←' : '→'} <bdi>{fmtTime(trade.closeTime)}</bdi></span>
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
                    <th className="col-idx" >#</th>
                    <th>{t('table.symbol')}</th>
                    <th>{t('table.type')}</th>
                    <th>{t('common.side')}</th>
                    <th className="align-right" >{t('table.volume')}</th>
                    <th className="align-right" >{t('common.limitPrice')}</th>
                    <th className="align-right" >{t('common.stopPrice')}</th>
                    <th className="text-sm">{t('table.createdAt')}</th>
                    <th className="text-center" >{t('table.action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingLoading ? (
                    <SkeletonRow />
                  ) : filteredPending.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="empty-note text-muted text-sm" >
                        {t('positions.noPending')}
                      </td>
                    </tr>
                  ) : (
                    filteredPending.map((o, idx) => {
                      const isCancelling = cancellingId === o.id;
                      return (
                        <tr key={o.id}>
                          <td className="col-idx text-muted text-sm" >{idx + 1}</td>
                          <td className="font-bold">{o.symbolCode}</td>
                          <td>
                            <span className="badge badge-primary">
                              {o.orderType}
                            </span>
                          </td>
                          <td>
                            <span className={`badge ${o.side === 'BUY' ? 'badge-success' : 'badge-danger'}`}>
                              {o.side === 'BUY' ? t('badge.buy') : t('badge.sell')}
                            </span>
                          </td>
                          <td className="align-right dir-ltr" >{fmtQty(o.quantity)}</td>
                          <td className="align-right dir-ltr" >{o.orderType === 'CLOSE' ? '—' : fmtPrice(o.limitPrice)}</td>
                          <td className="align-right dir-ltr" >{fmtPrice(o.stopPrice)}</td>
                          <td className="text-sm">{fmtTime(o.createdAt)}</td>
                          <td className="text-center" >
                            <button
                              type="button"
                              className="btn btn-outline-danger"
                              style={{ padding: '5px 12px', fontSize: '0.8rem' }}
                              disabled={isCancelling}
                              onClick={() => {
                                const run = () => void handleCancelOrder(o.id, o.symbolCode);
                                if (oneClick) run();
                                else setConfirm({ message: t('confirm.cancelOrder', { symbol: o.symbolCode }), run });
                              }}
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
                          <span className="badge badge-primary">
                            {o.orderType}
                          </span>
                        </div>
                      </div>
                      <div className="mobile-trading-card-grid">
                        <div>
                          <div className="text-xs text-muted">{t('table.volume')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtQty(o.quantity)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('common.limitPrice')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{o.orderType === 'CLOSE' ? '—' : fmtPrice(o.limitPrice)}</bdi></div>
                        </div>
                        <div>
                          <div className="text-xs text-muted">{t('common.stopPrice')}</div>
                          <div className="text-sm"><bdi dir="ltr" className="dir-ltr">{fmtPrice(o.stopPrice)}</bdi></div>
                        </div>
                      </div>
                      <div className="mobile-trading-card-actions">
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-block"
                          disabled={isCancelling}
                          onClick={() => {
                            const run = () => void handleCancelOrder(o.id, o.symbolCode);
                            if (oneClick) run();
                            else setConfirm({ message: t('confirm.cancelOrder', { symbol: o.symbolCode }), run });
                          }}
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
