import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { useLogout } from '@/hooks/useLogout';
import { DashboardHeader } from '@/components/DashboardHeader';
import { SkeletonCard, SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, usePositions, useNotifications, useLivePrices, useTradeHistory } from '@/hooks/useApi';
import { getContractSize } from '@/lib/api';

/**
 * Formatting utility to render numeric values as currency localized strings.
 *
 * @param value raw numeric input value
 * @param currency target currency code, defaults to USD
 * @returns formatted currency string
 */
function fmtMoney(value: unknown, currency = 'USD'): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtPnl(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '—';
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Formatting utility to render numeric values as price quotes with up to 5 decimals.
 *
 * @param n raw numeric price quote input
 * @returns formatted price quote string
 */
function fmtPrice(n: unknown): string {
  if (n == null) return '—';
  const v = Number(n);
  if (isNaN(v)) return '—';
  const abs = Math.abs(v);
  // Fixed decimals within each magnitude band so live ticks don't change string length.
  const d = abs > 0 && abs < 10 ? 5 : (abs >= 10 && abs < 500 ? 3 : 2);
  return v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

/**
 * Main application dashboard landing screen.
 * Displays user balances (Equity, Margin, Free Margin, P/L), active open positions, and notifications alerts.
 * The goal of this page is to summarize active trading operations and notify the user on state changes.
 *
 * @returns Dashboard page layout element
 */
export function DashboardPage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const { logout, loggingOut } = useLogout();

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useBrokerOverview();
  const { data: positionsData, isLoading: positionsLoading } = usePositions();
  const { data: notificationsData, isLoading: notifsLoading } = useNotifications();
  const { data: historyData } = useTradeHistory();

  const positionSymbols = Array.isArray(positionsData) ? positionsData.map((p) => p.symbolCode) : [];
  const livePrices = useLivePrices(positionSymbols);

  const isLoading = overviewLoading || positionsLoading || notifsLoading;

  useEffect(() => {
    document.title = t('titles.dashboard');
  }, [t]);

  useEffect(() => {
    if (overviewError && (overviewError as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 800);
    }
  }, [overviewError, navigate, t, toast]);


  const currency = overview?.currency || 'USD';
  const rawBalance = overview ? Number(overview.balance ?? 0) : 0;
  const rawMarginUsed = overview ? Number(overview.marginUsed ?? 0) : 0;

  const notifications = Array.isArray(notificationsData) ? notificationsData.slice(0, 5) : [];
  const positions = Array.isArray(positionsData) ? positionsData : [];

  // Calculate live unrealized P/L from open positions using real-time prices
  const livePnl = positions.reduce((sum, p) => {
    const qty = Math.abs(Number(p.quantity ?? 0));
    if (!qty) return sum;
    const avg = Number(p.avgPrice ?? 0);
    const live = livePrices[p.symbolCode.toUpperCase()] ?? livePrices[p.symbolCode];
    if (!live) return sum;
    const factor = p.side === 'SHORT' ? -1 : 1;
    return sum + (live - avg) * qty * factor * getContractSize(p.symbolCode);
  }, 0);

  const history = Array.isArray(historyData) ? historyData : [];

  const totalRealizedPnl = history.reduce((sum, order) => {
    if (order.realizedPnl == null) return sum;
    return sum + Number(order.realizedPnl);
  }, 0);

  const nowMs = Date.now();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  const todayRealizedPnl = history.reduce((sum, order) => {
    if (order.realizedPnl == null) return sum;
    const dateToCheck = order.filledAt || order.createdAt;
    if (!dateToCheck) return sum;
    const orderMs = new Date(dateToCheck).getTime();
    const isToday = (nowMs - orderMs) <= ONE_DAY_MS;
    return sum + (isToday ? Number(order.realizedPnl) : 0);
  }, 0);

  const liveEquity = rawBalance + livePnl;
  const liveFreeMargin = liveEquity - rawMarginUsed;

  const balance = overview ? fmtMoney(rawBalance, currency) : '—';
  const equity = overview ? fmtMoney(liveEquity, currency) : '—';
  const marginUsed = overview ? fmtMoney(rawMarginUsed, currency) : '—';
  const freeMargin = overview ? fmtMoney(liveFreeMargin, currency) : '—';

  const pnl = overview ? (totalRealizedPnl + livePnl) : 0;
  const pl = overview ? `${pnl >= 0 ? '+' : ''}${fmtPnl(pnl)}` : '—';
  const plPositive = pnl >= 0;

  const borrowedBalance = overview ? Number(overview.borrowedBalance ?? 0) : 0;
  const creditLimit = overview ? Number(overview.creditLimit ?? 10000) : 10000;
  const marginLevelPct = overview && overview.marginLevelPct != null ? Number(overview.marginLevelPct) : null;
  const interestAccrued = overview ? Number(overview.interestAccruedTotal ?? 0) : 0;
  const dailyInterestRate = overview && overview.dailyInterestRate ? Number(overview.dailyInterestRate) : 0.005;
  const dailyInterestStr = `${(dailyInterestRate * 100).toFixed(1)}% / day`;
  const hasDebt = borrowedBalance > 0;

  const isMarginCall = marginLevelPct != null && marginLevelPct < 110;
  const isLiquidationRisk = marginLevelPct != null && marginLevelPct < 100;

  return (
    <>
      <DashboardHeader onLogout={() => void logout()} loggingOut={loggingOut} />

      <div className="container mt-20">

        {/* ── Stat cards ── */}
        <div className="stats-grid mb-20">
          {isLoading ? (
            <>
              <SkeletonCard rows={2} height={90} />
              <SkeletonCard rows={2} height={90} />
              <SkeletonCard rows={2} height={90} />
              <SkeletonCard rows={2} height={90} />
            </>
          ) : (
            <>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.balance')}
                </div>
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{balance}</div>
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.equity')}
                </div>
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{equity}</div>
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.pl')}
                </div>
                <div className={`value ${plPositive ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  {pl}
                </div>
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.freeMargin')}
                </div>
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}>{freeMargin}</div>
              </div>
            </>
          )}
        </div>

        {/* ── Credit line / margin call banner ── */}
        {!isLoading && hasDebt && isMarginCall && (
          <div
            className="card mb-20"
            style={{
              padding: '14px 20px',
              background: isLiquidationRisk ? 'var(--red-soft, #fdecea)' : 'var(--yellow-soft, #fff8e1)',
              border: `1px solid ${isLiquidationRisk ? 'var(--red)' : 'var(--yellow, #f0ad4e)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>{isLiquidationRisk ? '🚨' : '⚠️'}</span>
            <div>
              <div style={{ fontWeight: 700, color: isLiquidationRisk ? 'var(--red)' : '#8a6100' }}>
                {isLiquidationRisk ? t('dashboard.liquidationRisk') : t('dashboard.marginCallWarning')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                {t('dashboard.marginLevel')}: {marginLevelPct?.toFixed(1)}%
              </div>
            </div>
          </div>
        )}

        {/* ── Dedicated Credit Line & Margin Loan Section (Shown ONLY when active loan exists) ── */}
        {!isLoading && hasDebt && (
          <div className="card mb-20" style={{ padding: '20px 24px' }}>
            <div className="flex-between mb-20">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '1.2rem' }}>📜</span>
                <h3 style={{ margin: 0 }}>{t('dashboard.creditLine')} &amp; Margin Loan</h3>
              </div>
              <span
                className="badge"
                style={{
                  background: !hasDebt
                    ? 'var(--green-soft)'
                    : isLiquidationRisk
                    ? 'var(--red-soft, #fdecea)'
                    : isMarginCall
                    ? 'var(--yellow-soft, #fff8e1)'
                    : 'var(--blue-soft, #e3f2fd)',
                  color: !hasDebt
                    ? 'var(--green)'
                    : isLiquidationRisk
                    ? 'var(--red)'
                    : isMarginCall
                    ? '#8a6100'
                    : 'var(--blue, #1976d2)',
                  fontWeight: 600,
                  fontSize: '0.8rem',
                  padding: '4px 12px',
                  borderRadius: 20
                }}
              >
                {!hasDebt
                  ? `🟢 ${t('dashboard.creditAvailable')}`
                  : isLiquidationRisk
                  ? `🚨 ${t('dashboard.liquidationRisk')} (${marginLevelPct?.toFixed(1)}%)`
                  : isMarginCall
                  ? `⚠️ ${t('dashboard.marginCallWarning').split(':')[0]} (${marginLevelPct?.toFixed(1)}%)`
                  : `🔵 ${t('dashboard.activeDebt')} (${marginLevelPct?.toFixed(1)}%)`}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.borrowedDebt')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: hasDebt ? 'var(--red)' : 'inherit' }}>
                  {fmtMoney(borrowedBalance, currency)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  / {fmtMoney(creditLimit, currency)} {t('dashboard.creditLimit')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.availableCredit')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--green)' }}>
                  {fmtMoney(Math.max(0, creditLimit - borrowedBalance), currency)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t('dashboard.autoBorrowLimit')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.interestAccrued')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
                  {fmtMoney(interestAccrued, currency)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {dailyInterestStr}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.marginLevel')}
                </div>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: '1.2rem',
                    color: isLiquidationRisk ? 'var(--red)' : isMarginCall ? '#c99400' : hasDebt ? 'var(--green)' : 'var(--text-secondary)',
                  }}
                >
                  {marginLevelPct != null ? `${marginLevelPct.toFixed(1)}%` : `— ${t('dashboard.noDebt')}`}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t('dashboard.liquidationNote')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Quick Actions + Alerts ── */}
        <div className="grid-2 mb-20" style={{ gridTemplateColumns: '2fr 1fr' }}>

          {/* Trading Summary */}
          <div className="card" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div className="flex-between" style={{ marginBottom: 20 }}>
              <h3 style={{ margin: 0 }}>{t('dashboard.tradingPerformance')}</h3>
              <span
                style={{
                  background: 'var(--green-soft)',
                  color: 'var(--green)',
                  padding: '3px 10px',
                  borderRadius: 20,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                }}
              >
                {overview?.accountType || 'DEMO'} · {overview?.currency || 'USD'} · 1:{overview?.leverage ?? '—'}
              </span>
            </div>

            {/* Position stats */}
            {positionsLoading ? (
              <SkeletonCard rows={2} height={80} />
            ) : (() => {
              const totalUnrealized = positions.reduce((sum, p) => {
                const liveP = livePrices[p.symbolCode.toUpperCase()];
                const qty = Number(p.quantity ?? 0);
                const avg = Number(p.avgPrice ?? 0);
                if (liveP) {
                  const factor = p.side === 'SHORT' ? -1 : 1;
                  return sum + (liveP - avg) * qty * factor * getContractSize(p.symbolCode);
                }
                return sum + Number(p.unrealizedPnl ?? 0);
              }, 0);

              const best = positions.length > 0
                ? positions.reduce((a, b) => {
                    const liveA = livePrices[a.symbolCode.toUpperCase()];
                    const liveB = livePrices[b.symbolCode.toUpperCase()];
                    const factorA = a.side === 'SHORT' ? -1 : 1;
                    const factorB = b.side === 'SHORT' ? -1 : 1;
                    const pnlA = liveA
                      ? (liveA - Number(a.avgPrice ?? 0)) * Number(a.quantity ?? 0) * factorA * getContractSize(a.symbolCode)
                      : Number(a.unrealizedPnl ?? 0);
                    const pnlB = liveB
                      ? (liveB - Number(b.avgPrice ?? 0)) * Number(b.quantity ?? 0) * factorB * getContractSize(b.symbolCode)
                      : Number(b.unrealizedPnl ?? 0);
                    return pnlA > pnlB ? a : b;
                  })
                : null;

              const worst = positions.length > 0
                ? positions.reduce((a, b) => {
                    const liveA = livePrices[a.symbolCode.toUpperCase()];
                    const liveB = livePrices[b.symbolCode.toUpperCase()];
                    const factorA = a.side === 'SHORT' ? -1 : 1;
                    const factorB = b.side === 'SHORT' ? -1 : 1;
                    const pnlA = liveA
                      ? (liveA - Number(a.avgPrice ?? 0)) * Number(a.quantity ?? 0) * factorA * getContractSize(a.symbolCode)
                      : Number(a.unrealizedPnl ?? 0);
                    const pnlB = liveB
                      ? (liveB - Number(b.avgPrice ?? 0)) * Number(b.quantity ?? 0) * factorB * getContractSize(b.symbolCode)
                      : Number(b.unrealizedPnl ?? 0);
                    return pnlA < pnlB ? a : b;
                  })
                : null;

              const bestPnl = best
                ? (livePrices[best.symbolCode.toUpperCase()]
                    ? (livePrices[best.symbolCode.toUpperCase()] - Number(best.avgPrice ?? 0)) * Number(best.quantity ?? 0) * (best.side === 'SHORT' ? -1 : 1) * getContractSize(best.symbolCode)
                    : Number(best.unrealizedPnl ?? 0))
                : 0;
              const worstPnl = worst
                ? (livePrices[worst.symbolCode.toUpperCase()]
                    ? (livePrices[worst.symbolCode.toUpperCase()] - Number(worst.avgPrice ?? 0)) * Number(worst.quantity ?? 0) * (worst.side === 'SHORT' ? -1 : 1) * getContractSize(worst.symbolCode)
                    : Number(worst.unrealizedPnl ?? 0))
                : 0;

              return (
                <>
                  {/* PnL & Performance Breakdown Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 20 }}>
                    <div
                      style={{
                        background: 'var(--bg-alt)',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.realizedPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: todayRealizedPnl >= 0 ? 'var(--green)' : 'var(--red)',
                        }}
                      >
                        {todayRealizedPnl >= 0 ? '+' : ''}{fmtPnl(todayRealizedPnl)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {t('dashboard.closedToday')}
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-alt)',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.unrealizedPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: totalUnrealized >= 0 ? 'var(--green)' : 'var(--red)',
                        }}
                      >
                        {totalUnrealized >= 0 ? '+' : ''}{fmtPnl(totalUnrealized)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {positions.length} {t('dashboard.openPositions')}
                      </div>
                    </div>

                    <div
                      style={{
                        background: 'var(--bg-alt)',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.netPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: pnl >= 0 ? 'var(--green)' : 'var(--red)',
                        }}
                      >
                        {pl}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {t('dashboard.totalRealizedLive')}
                      </div>
                    </div>
                  </div>

                  {/* Best / Worst */}
                  {positions.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                      <div style={{ fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>↑ {t('dashboard.bestPosition')}</div>
                        <span style={{ fontWeight: 600 }}>{best?.symbolCode}</span>{' '}
                        <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                          {bestPnl >= 0 ? '+' : ''}{fmtPnl(bestPnl)}
                        </span>
                      </div>
                      {positions.length > 1 && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>↓ {t('dashboard.worstPosition')}</div>
                          <span style={{ fontWeight: 600 }}>{worst?.symbolCode}</span>{' '}
                          <span style={{ color: 'var(--red)', fontWeight: 600 }}>
                            {fmtPnl(worstPnl)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Account meta + single CTA */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: 16,
                borderTop: '1px solid var(--border-light)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('dashboard.marginUsed')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{marginUsed}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('dashboard.freeMargin')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{freeMargin}</div>
                </div>
              </div>
              <Link to="/charts" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
                + {t('dashboard.newTrade')}
              </Link>
            </div>
          </div>

          {/* Notifications */}
          <div className="card" style={{ padding: '24px 20px' }}>
            <div className="flex-between mb-20">
              <h3 style={{ margin: 0 }}>{t('dashboard.alerts')}</h3>
              {notifications.length > 0 && (
                <span
                  style={{
                    background: 'var(--primary)',
                    color: '#fff',
                    borderRadius: '50%',
                    width: 20,
                    height: 20,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {notifications.length}
                </span>
              )}
            </div>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {notifsLoading ? (
                <>
                  <SkeletonCard rows={1} height={48} />
                  <div style={{ marginTop: 8 }} />
                  <SkeletonCard rows={1} height={48} />
                </>
              ) : notifications.length === 0 ? (
                <li style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', padding: '16px 0', textAlign: 'center' }}>
                  {t('dashboard.noNotifications')}
                </li>
              ) : (
                notifications.map((n) => {
                  let displayTitle = t(n.title) || n.title;
                  let displayBody = n.body;
                  try {
                    const data = JSON.parse(n.body);
                    const bodyKey = n.title.replace('.title', '.body');
                    let bodyTemplate = t(bodyKey) || bodyKey;
                    if (data.side) {
                      data.side = t(`badge.${data.side.toLowerCase()}`) || data.side;
                    }
                    Object.keys(data).forEach((key) => {
                      bodyTemplate = bodyTemplate.replace(`{${key}}`, data[key]);
                    });
                    displayBody = bodyTemplate;
                  } catch {
                    displayBody = t(n.body) || n.body;
                  }
                  return (
                    <li
                      key={n.id}
                      style={{
                        padding: '10px 0',
                        borderBottom: '1px solid var(--border-light)',
                        fontSize: '0.85rem',
                      }}
                    >
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <span
                          className="badge"
                          style={{
                            background: n.notifType === 'TRADE' ? 'var(--blue-soft)' : 'var(--bg-alt)',
                            color: n.notifType === 'TRADE' ? 'var(--blue)' : 'var(--text-secondary)',
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                        >
                          {t(`badge.${n.notifType.toLowerCase()}`) || n.notifType}
                        </span>
                        <div>
                          <div style={{ fontWeight: 600, marginBottom: 2 }}>{displayTitle}</div>
                          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{displayBody}</div>
                        </div>
                      </div>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>

        {/* ── Open Positions table ── */}
        <div className="flex-between mb-20">
          <h3 style={{ margin: 0 }}>
            {t('dashboard.openPositions')}
            {positions.length > 0 && (
              <span
                style={{
                  marginInlineStart: 8,
                  background: 'var(--bg-alt)',
                  color: 'var(--text-secondary)',
                  borderRadius: 12,
                  padding: '2px 8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                {positions.length}
              </span>
            )}
          </h3>
          <Link to="/positions" className="btn btn-outline-dark" style={{ fontSize: '0.85rem' }}>
            {t('dashboard.viewAll')}
          </Link>
        </div>

        <div style={{
          maxHeight: positions.length > 6 ? 340 : undefined,
          overflowY: positions.length > 6 ? 'auto' : undefined,
          borderRadius: 16,
        }}>
        <table>
          <thead style={{ position: positions.length > 6 ? 'sticky' : undefined, top: 0, zIndex: 1 }}>
            <tr>
              <th>{t('table.symbol')}</th>
              <th>{t('table.volume')}</th>
              <th>{t('table.openPrice')}</th>
              <th>{t('table.currentPrice')}</th>
              <th>{t('table.pl')}</th>
              <th>{t('table.status')}</th>
            </tr>
          </thead>
          <tbody>
            {positionsLoading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : positions.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-muted text-sm" style={{ padding: 20, textAlign: 'center' }}>
                  {t('positions.empty')}
                </td>
              </tr>
            ) : (
              positions.map((p) => {
                const qty = Math.abs(Number(p.quantity ?? 0));
                const unrealized = Number(p.unrealizedPnl ?? 0);
                const livePrice = livePrices[p.symbolCode.toUpperCase()];
                const livePnl = livePrice && p.avgPrice
                  ? (p.side === 'SHORT' ? -1 : 1) * (livePrice - Number(p.avgPrice)) * qty * getContractSize(p.symbolCode)
                  : unrealized;
                const pnlPos = livePnl;
                return (
                  <tr key={p.id}>
                    <td className="font-bold">{p.symbolCode}</td>
                    <td>{qty.toFixed(4)}</td>
                    <td className="dir-ltr">{fmtPrice(p.avgPrice)}</td>
                    <td className="dir-ltr">
                      {livePrice ? (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {fmtPrice(livePrice)}
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>loading…</span>
                      )}
                    </td>
                    <td className={`font-bold dir-ltr ${pnlPos >= 0 ? 'text-success' : 'text-danger'}`}>
                      {pnlPos >= 0 ? '+' : ''}{fmtPnl(pnlPos)}
                    </td>
                    <td>
                      <span className="badge badge-success">{t('badge.open')}</span>
                    </td>
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
