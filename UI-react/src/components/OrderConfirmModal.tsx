import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { estimateOrderCost } from '@/lib/tradeUtils';
import { fmtMoney, NUM_LOCALE } from '@/lib/format';

export interface OrderConfirmDetails {
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT';
  lots: number;
  /** Ask/Bid estimate for MARKET, the entered price for LIMIT. */
  price: number;
  leverage: number;
  /** Free cash before the trade. */
  freeFunds: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface Props extends OrderConfirmDetails {
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

function fmtPrice(v: number): string {
  const abs = Math.abs(v);
  const d = abs > 1000 ? 2 : abs >= 10 ? 4 : 5;
  return v.toLocaleString(NUM_LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtUsd(v: number): string {
  return v < 0 ? `−${fmtMoney(-v)}` : fmtMoney(v);
}

export function OrderConfirmModal(props: Props) {
  const { symbol, side, orderType, lots, price, leverage, freeFunds, stopLoss, takeProfit, onConfirm, onCancel } = props;
  const { t } = useI18n();
  const [dontAsk, setDontAsk] = useState(false);
  const cost = estimateOrderCost(symbol, lots, price, leverage);
  const freeAfter = freeFunds - cost.total;
  const sideColor = side === 'BUY' ? 'var(--green, #22c55e)' : 'var(--red, #ef4444)';
  const sideLabel = side === 'BUY' ? t('trading.buy') : t('trading.sell');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const rows: [string, string, string?][] = [
    [t('confirmOrder.instrument'), symbol],
    [t('confirmOrder.side'), sideLabel, sideColor],
    [t('trading.orderType'), t(`trading.${orderType.toLowerCase()}`)],
    [t('table.volume'), t('confirmOrder.volumeValue', {
      lots: lots.toLocaleString(NUM_LOCALE, { maximumFractionDigits: 2 }),
      units: cost.units.toLocaleString(NUM_LOCALE, { maximumFractionDigits: 2 }),
    })],
    [orderType === 'MARKET' ? t('confirmOrder.priceMarket') : t('confirmOrder.priceLimit'),
      (orderType === 'MARKET' ? '≈ ' : '') + fmtPrice(price)],
  ];
  if (stopLoss != null) rows.push([t('trading.stopLoss'), fmtPrice(stopLoss)]);
  if (takeProfit != null) rows.push([t('trading.takeProfit'), fmtPrice(takeProfit)]);

  const money: [string, string, boolean?][] = [
    [t('confirmOrder.notional'), fmtUsd(cost.notional)],
    [t('confirmOrder.margin', { leverage }), fmtUsd(cost.margin)],
    [t('confirmOrder.commission'), fmtUsd(cost.commission)],
    [t('confirmOrder.total'), fmtUsd(cost.total), true],
  ];

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onCancel}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-confirm-title"
        style={{ maxWidth: 420, width: '100%', padding: 26 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="order-confirm-title" style={{ margin: '0 0 16px', fontSize: '1.2rem' }}>{t('confirmOrder.title')}</h3>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {rows.map(([label, value, color]) => (
            <div key={label} className="flex-between">
              <span className="text-sm text-secondary">{label}</span>
              <span className="font-bold" style={{ color, direction: 'ltr', unicodeBidi: 'isolate' }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ background: 'var(--bg-alt)', borderRadius: 10, padding: '12px 14px', display: 'grid', gap: 8 }}>
          {money.map(([label, value, strong]) => (
            <div key={label} className="flex-between" style={strong ? { borderTop: '1px solid var(--border-light)', paddingTop: 8 } : undefined}>
              <span className="text-sm" style={{ color: strong ? undefined : 'var(--text-secondary)', fontWeight: strong ? 700 : undefined }}>{label}</span>
              <span style={{ fontWeight: strong ? 700 : 600, direction: 'ltr', unicodeBidi: 'isolate' }}>{value}</span>
            </div>
          ))}
          <div className="flex-between">
            <span className="text-sm text-secondary">{t('confirmOrder.freeAfter')}</span>
            <span style={{ fontWeight: 600, direction: 'ltr', unicodeBidi: 'isolate', color: freeAfter < 0 ? 'var(--red, #ef4444)' : undefined }}>
              {fmtUsd(freeAfter)}
            </span>
          </div>
        </div>

        {orderType === 'MARKET' && (
          <p className="text-xs text-muted" style={{ margin: '10px 0 0' }}>{t('confirmOrder.marketNote')}</p>
        )}

        <label className="text-sm" style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0', cursor: 'pointer' }}>
          <input type="checkbox" checked={dontAsk} onChange={(e) => setDontAsk(e.target.checked)} />
          {t('confirmOrder.dontAsk')}
        </label>

        <div className="flex-gap">
          <button type="button" className="btn btn-outline-dark" style={{ flex: 1 }} onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            autoFocus
            className={`btn ${side === 'BUY' ? 'btn-success' : 'btn-danger'}`}
            style={{ flex: 1.4 }}
            onClick={() => onConfirm(dontAsk)}
          >
            {t('confirmOrder.submit', { side: sideLabel })}
          </button>
        </div>
      </div>
    </div>
  );
}
