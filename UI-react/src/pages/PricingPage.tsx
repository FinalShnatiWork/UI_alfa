import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useAuth } from '@/hooks/useAuth';
import { useLogout } from '@/hooks/useLogout';
import { AuthHeader } from '@/components/AuthHeader';
import { DashboardHeader } from '@/components/DashboardHeader';
import { getContractSize } from '@/lib/api';
import { fmtMoney, fmtNumber } from '@/lib/format';
import {
  COMMISSION_PER_LOT,
  CREDIT_LIMIT,
  CRYPTO_COMMISSION_RATE,
  DAILY_INTEREST_RATE,
  LEVERAGE,
  LIQUIDATION_LEVEL_PCT,
  MARGIN_CALL_LEVEL_PCT,
  MAX_LOTS,
  MIN_LOTS,
  PROFIT_FEE_CAP,
  SPREAD_RATE,
  estimateOrderCost,
} from '@/lib/tradeUtils';

const pct = (rate: number, digits = 2) => `${fmtNumber(rate * 100, digits)}%`;

const GROUPS = [
  { key: 'forex', symbols: ['EURUSD', 'GBPUSD', 'USDCAD', 'EURNOK', 'GBPJPY', 'USDJPY', 'NZDUSD', 'CADJPY'], crypto: false },
  { key: 'metals', symbols: ['XAUUSD', 'XAGUSD'], crypto: false },
  { key: 'crypto', symbols: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'], crypto: true },
] as const;

/** Symbols that share a contract size, e.g. [[1, [BTCUSD, ETHUSD, SOLUSD]], [1000, [XRPUSD]]]. */
function sizeGroups(symbols: readonly string[]): [number, string[]][] {
  const out = new Map<number, string[]>();
  for (const s of symbols) out.set(getContractSize(s), [...(out.get(getContractSize(s)) ?? []), s]);
  return [...out.entries()];
}

const EXAMPLES = [
  { symbol: 'EURUSD', lots: 1, price: 1.1 },
  { symbol: 'BTCUSD', lots: 0.1, price: 60000 },
] as const;

/** Public page with the fees the server actually charges. */
export function PricingPage() {
  const { t } = useI18n();
  const { status } = useAuth();
  const { logout, loggingOut } = useLogout();

  useEffect(() => { document.title = t('titles.pricing'); }, [t]);

  const header = status === 'authenticated'
    ? <DashboardHeader onLogout={() => void logout()} loggingOut={loggingOut} />
    : (
      <AuthHeader>
        <div className="flex-gap">
          <Link to="/login" className="btn btn-outline">{t('landing.logIn')}</Link>
          <Link to="/register" className="btn btn-primary">{t('landing.signUp')}</Link>
        </div>
      </AuthHeader>
    );

  return (
    <>
      {header}
      <div className="container mt-20" style={{ maxWidth: 960 }}>
        <h1 style={{ marginBottom: 6 }}>{t('pricing.title')}</h1>
        <p className="text-secondary" style={{ marginBottom: 24 }}>{t('pricing.sub')}</p>

        <section className="card text-left" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.commissionTitle')}</h3>
          <div className="table-scroll">
            <table className="table-compact" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th className="wrap">{t('pricing.colGroup')}</th>
                  <th className="wrap">{t('pricing.colSymbols')}</th>
                  <th className="wrap">{t('pricing.colLot')}</th>
                  <th className="wrap">{t('pricing.colCommission')}</th>
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => (
                  <tr key={g.key}>
                    <td className="font-bold">{t(`pricing.group.${g.key}`)}</td>
                    <td className="wrap"><bdi>{g.symbols.join(', ')}</bdi></td>
                    <td className="wrap">
                      {g.key === 'forex'
                        ? t('pricing.lotForex', { size: fmtNumber(getContractSize('EURUSD'), 0) })
                        : sizeGroups(g.symbols).map(([size, symbols]) => (
                          <div key={size}>
                            {t(g.key === 'metals' ? 'pricing.lotOunces' : 'pricing.lotCoins', {
                              symbol: symbols.join(', '),
                              size: fmtNumber(size, 0),
                            })}
                          </div>
                        ))}
                    </td>
                    <td className="wrap">
                      <bdi className="font-bold">
                        {g.crypto
                          ? t('pricing.feeCrypto', { pct: pct(CRYPTO_COMMISSION_RATE, 1) })
                          : t('pricing.feePerLot', { amount: fmtMoney(COMMISSION_PER_LOT) })}
                      </bdi>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="text-sm text-secondary" style={{ marginBottom: 0, paddingInlineStart: 18, lineHeight: 1.7 }}>
            <li>{t('pricing.feeBothLegs')}</li>
            <li>{t('pricing.feeCap', { pct: pct(PROFIT_FEE_CAP, 0) })}</li>
          </ul>
        </section>

        <section className="card text-left" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.spreadTitle')}</h3>
          <p style={{ marginBottom: 0 }}>{t('pricing.spreadText', { pct: pct(SPREAD_RATE, 3), total: pct(SPREAD_RATE * 2, 2) })}</p>
        </section>

        <section className="card text-left" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.marginTitle')}</h3>
          <ul style={{ marginBottom: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
            <li>{t('pricing.leverage', { leverage: `1:${LEVERAGE}` })}</li>
            <li>{t('pricing.marginFormula', { leverage: LEVERAGE })}</li>
            <li>{t('pricing.volume', { min: fmtNumber(MIN_LOTS, 2), max: fmtNumber(MAX_LOTS, 0), step: fmtNumber(MIN_LOTS, 2) })}</li>
          </ul>
        </section>

        <section className="card text-left" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.creditTitle')}</h3>
          <ul style={{ marginBottom: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
            <li>{t('pricing.creditLimit', { amount: fmtMoney(CREDIT_LIMIT) })}</li>
            <li>{t('pricing.creditRate', { pct: pct(DAILY_INTEREST_RATE, 1) })}</li>
            <li>{t('pricing.creditMarginCall', { pct: `${MARGIN_CALL_LEVEL_PCT}%` })}</li>
            <li>{t('pricing.creditLiquidation', { pct: `${LIQUIDATION_LEVEL_PCT}%` })}</li>
            <li>{t('pricing.creditLoss')}</li>
            <li>{t('pricing.creditRepay')}</li>
          </ul>
        </section>

        <section className="card text-left" style={{ marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.otherTitle')}</h3>
          <ul style={{ marginBottom: 0, paddingInlineStart: 18, lineHeight: 1.8 }}>
            <li>{t('pricing.noSwap')}</li>
            <li>{t('pricing.noTransferFee')}</li>
            <li>{t('pricing.withdrawReview')}</li>
          </ul>
        </section>

        <section className="card text-left" style={{ marginBottom: 40 }}>
          <h3 style={{ marginTop: 0 }}>{t('pricing.exampleTitle')}</h3>
          <p className="text-sm text-secondary">{t('pricing.exampleHint')}</p>
          <div className="table-scroll">
            <table className="table-compact" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th className="wrap">{t('pricing.colTrade')}</th>
                  <th className="wrap">{t('pricing.colMargin')}</th>
                  <th className="wrap">{t('pricing.colCommissionTotal')}</th>
                  <th className="wrap">{t('pricing.colSpread')}</th>
                  <th className="wrap">{t('pricing.colTotalCost')}</th>
                </tr>
              </thead>
              <tbody>
                {EXAMPLES.map((ex) => {
                  const cost = estimateOrderCost(ex.symbol, ex.lots, ex.price, LEVERAGE);
                  const commission = cost.commission * 2;
                  const spread = cost.notional * SPREAD_RATE * 2;
                  return (
                    <tr key={ex.symbol}>
                      <td>
                        <bdi>{`${ex.symbol} · ${fmtNumber(ex.lots, 2)} · ${fmtNumber(ex.price, ex.price < 10 ? 5 : 2)}`}</bdi>
                      </td>
                      <td><bdi>{fmtMoney(cost.margin)}</bdi></td>
                      <td><bdi>{fmtMoney(commission)}</bdi></td>
                      <td><bdi>≈ {fmtMoney(spread)}</bdi></td>
                      <td className="font-bold"><bdi>≈ {fmtMoney(commission + spread)}</bdi></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-secondary" style={{ marginBottom: 0 }}>{t('pricing.exampleNote')}</p>
        </section>
      </div>
    </>
  );
}
