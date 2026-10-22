import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useLogout } from '@/hooks/useLogout';
import { DashboardHeader } from '@/components/DashboardHeader';
import { SkeletonCard, SkeletonRow } from '@/components/Skeleton';
import { AccountValueChart } from '@/components/AccountValueChart';
import { useBrokerOverview, usePositions, useNotifications, useLivePrices, useTradeHistory } from '@/hooks/useApi';
import { livePriceFor, positionPnl } from '@/lib/tradeUtils';
import { fmtLots, fmtMoney, fmtPrice as fmtQuote, fmtSignedMoney } from '@/lib/format';

/** Price quote with fixed decimals per magnitude band, so live ticks don't change the string length. */
const fmtPrice = (n: unknown) => fmtQuote(n, undefined, false);

/**
 * Main application dashboard landing screen.
 * Displays user balances (Equity, Margin, Free Margin, P/L), active open positions, and notifications alerts.
 * The goal of this page is to summarize active trading operations and notify the user on state changes.
 *
 * @returns Dashboard page layout element
 */
export function DashboardPage() {
  const { t } = useI18n();
  const { logout, loggingOut } = useLogout();
  /** Signed amount in the account currency, isolated so the sign stays in front in RTL. */
  const money = (n: number) => <bdi dir="ltr">{fmtSignedMoney(n, currency)}</bdi>;
  const pnlColor = (n: number) => (n >= 0 ? 'var(--green)' : 'var(--red)');

  const { data: overview, isLoading: overviewLoading } = useBrokerOverview();
  const { data: positionsData, isLoading: positionsLoading } = usePositions();
  const { data: notificationsData, isLoading: notifsLoading } = useNotifications();
  const { data: historyData } = useTradeHistory();

  const positionSymbols = Array.isArray(positionsData) ? positionsData.map((p) => p.symbolCode) : [];
  const livePrices = useLivePrices(positionSymbols);

  const isLoading = overviewLoading || positionsLoading || notifsLoading;

  useEffect(() => {
    document.title = t('titles.dashboard');
  }, [t]);


  const currency = overview?.currency || 'USD';
  const rawBalance = overview ? Number(overview.balance ?? 0) : 0;
  const rawMarginUsed = overview ? Number(overview.marginUsed ?? 0) : 0;

  const notifications = Array.isArray(notificationsData) ? notificationsData.slice(0, 5) : [];
  const positions = Array.isArray(positionsData) ? positionsData : [];

  const pnlOf = (p: (typeof positions)[number]) => positionPnl(p, livePriceFor(livePrices, p.symbolCode), livePrices);
  const livePnl = positions.reduce((sum, p) => sum + pnlOf(p), 0);

  const history = Array.isArray(historyData) ? historyData : [];

  const totalRealizedPnl = history.reduce((sum, order) => {
    if (order.realizedPnl == null) return sum;
    return sum + Number(order.realizedPnl);
  }, 0);

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayStartMs = startOfToday.getTime();
  const todayRealizedPnl = history.reduce((sum, order) => {
    if (order.realizedPnl == null) return sum;
    const dateToCheck = order.filledAt || order.createdAt;
    if (!dateToCheck) return sum;
    const orderMs = new Date(dateToCheck).getTime();
    if (Number.isNaN(orderMs) || orderMs < todayStartMs) return sum;
    return sum + Number(order.realizedPnl);
  }, 0);

  const liveEquity = rawBalance + livePnl;
  const pendingOut = overview ? Number(overview.pendingWithdrawal ?? 0) : 0;
  const backendFreeMargin = Number(overview?.freeMargin ?? (rawBalance - pendingOut));
  const liveFreeMargin = backendFreeMargin;

  const balance = overview ? fmtMoney(rawBalance, currency) : '—';
  const pendingOutLabel = pendingOut > 0 ? fmtMoney(pendingOut, currency) : '';
  const equity = overview ? fmtMoney(liveEquity, currency) : '—';
  const marginUsed = overview ? fmtMoney(rawMarginUsed, currency) : '—';
  const freeMargin = overview ? fmtMoney(liveFreeMargin, currency) : '—';

  const pnl = overview ? (totalRealizedPnl + livePnl) : 0;
  const pl = overview ? fmtSignedMoney(pnl, currency) : '—';
  const plPositive = pnl >= 0;

  const borrowedBalance = overview ? Number(overview.borrowedBalance ?? 0) : 0;
  const creditLimit = overview ? Number(overview.creditLimit ?? 10000) : 10000;
  const marginLevelPct = overview && overview.marginLevelPct != null ? Number(overview.marginLevelPct) : null;
  const hasDebt = borrowedBalance > 0;
  const interestAccrued = overview && hasDebt ? Number(overview.interestOnOpenDebt ?? 0) : 0;
  const dailyInterestRate = overview && overview.dailyInterestRate ? Number(overview.dailyInterestRate) : 0.005;
  const dailyInterestStr = t('common.pctPerDay', { pct: (dailyInterestRate * 100).toFixed(1) });

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
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}><bdi dir="ltr">{balance}</bdi></div>
                {pendingOut > 0 && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--warning, #f59e0b)', marginTop: 6 }}>
                    {t('dashboard.pendingOut', { amount: pendingOutLabel })}
                  </div>
                )}
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.equity')}
                </div>
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}><bdi dir="ltr">{equity}</bdi></div>
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.pl')}
                </div>
                <div className={`value ${plPositive ? 'text-success' : 'text-danger'}`} style={{ fontSize: '1.4rem', fontWeight: 700 }}>
                  <bdi dir="ltr">{pl}</bdi>
                </div>
              </div>
              <div className="card stat-card">
                <div className="label" style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 6 }}>
                  {t('dashboard.freeMargin')}
                </div>
                <div className="value" style={{ fontSize: '1.4rem', fontWeight: 700 }}><bdi dir="ltr">{freeMargin}</bdi></div>
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
              background: isLiquidationRisk ? 'var(--red-soft)' : 'var(--yellow-soft)',
              border: `1px solid ${isLiquidationRisk ? 'var(--red)' : 'var(--yellow, #f0ad4e)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>{isLiquidationRisk ? '🚨' : '⚠️'}</span>
            <div>
              <div style={{ fontWeight: 700, color: isLiquidationRisk ? 'var(--red)' : 'var(--warning-text)' }}>
                {isLiquidationRisk ? t('dashboard.liquidationRisk') : t('dashboard.marginCallWarning')}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-primary)' }}>
                {t('dashboard.marginLevel')}: <bdi dir="ltr" style={{ fontWeight: 700 }}>{marginLevelPct?.toFixed(1)}%</bdi>
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
                <h3 style={{ margin: 0 }}>{t('dashboard.creditLineTitle')}</h3>
              </div>
              <span
                className="badge"
                style={{
                  background: !hasDebt
                    ? 'var(--green-soft)'
                    : isLiquidationRisk
                    ? 'var(--red-soft)'
                    : isMarginCall
                    ? 'var(--yellow-soft)'
                    : 'var(--blue-soft)',
                  color: !hasDebt
                    ? 'var(--green)'
                    : isLiquidationRisk
                    ? 'var(--red)'
                    : isMarginCall
                    ? 'var(--warning-text)'
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

            <div className="dashboard-credit-grid">
              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.borrowedDebt')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: hasDebt ? 'var(--red)' : 'inherit' }}>
                  {fmtMoney(borrowedBalance, currency)}
                </div>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  / {fmtMoney(creditLimit, currency)} {t('dashboard.creditLimit')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.availableCredit')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: 'var(--green)' }}>
                  {fmtMoney(Math.max(0, creditLimit - borrowedBalance), currency)}
                </div>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t('dashboard.autoBorrowLimit')}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
                  {t('dashboard.interestAccrued')}
                </div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
                  {fmtMoney(interestAccrued, currency)}
                </div>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {dailyInterestStr}
                </div>
              </div>

              <div style={{ background: 'var(--bg-alt)', padding: '14px 16px', borderRadius: 10 }}>
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 6 }}>
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
                <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                  {t('dashboard.liquidationNote')}
                </div>
              </div>
            </div>
          </div>
        )}

        {!isLoading && <AccountValueChart />}

        {/* ── Quick Actions + Alerts ── */}
        <div className="dashboard-main-split mb-20">

          {/* Trading Summary */}
          <div className="card dashboard-perf-card" style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 0 }}>
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
              const totalUnrealized = livePnl;
              const best = positions.length > 0
                ? positions.reduce((a, b) => (pnlOf(a) > pnlOf(b) ? a : b))
                : null;
              const worst = positions.length > 0
                ? positions.reduce((a, b) => (pnlOf(a) < pnlOf(b) ? a : b))
                : null;
              const bestPnl = best ? pnlOf(best) : 0;
              const worstPnl = worst ? pnlOf(worst) : 0;

              return (
                <>
                  {/* PnL & Performance Breakdown Grid */}
                  <div className="dashboard-perf-grid">
                    <div
                      style={{
                        background: 'var(--bg-alt)',
                        borderRadius: 10,
                        padding: '14px 16px',
                      }}
                    >
                      <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.realizedPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: pnlColor(todayRealizedPnl),
                        }}
                      >
                        {money(todayRealizedPnl)}
                      </div>
                      <div className="dashboard-small-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
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
                      <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.unrealizedPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: pnlColor(totalUnrealized),
                        }}
                      >
                        {money(totalUnrealized)}
                      </div>
                      <div className="dashboard-small-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
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
                      <div className="dashboard-small-label" style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                        {t('dashboard.netPnl')}
                      </div>
                      <div
                        style={{
                          fontSize: '1.3rem',
                          fontWeight: 700,
                          lineHeight: 1,
                          color: pnlColor(pnl),
                        }}
                      >
                        <bdi dir="ltr">{pl}</bdi>
                      </div>
                      <div className="dashboard-small-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                        {t('dashboard.totalRealizedLive')}
                      </div>
                    </div>
                  </div>

                  {/* Best / Worst */}
                  {positions.length > 0 && (
                    <div className="dashboard-best-worst-grid">
                      <div style={{ fontSize: '0.8rem' }}>
                        <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>↑ {t('dashboard.bestPosition')}</div>
                        <span style={{ fontWeight: 600 }}>{best?.symbolCode}</span>{' '}
                        <span style={{ color: pnlColor(bestPnl), fontWeight: 600 }}>
                          {money(bestPnl)}
                        </span>
                      </div>
                      {positions.length > 1 && (
                        <div style={{ fontSize: '0.8rem' }}>
                          <div style={{ color: 'var(--text-secondary)', marginBottom: 3 }}>↓ {t('dashboard.worstPosition')}</div>
                          <span style={{ fontWeight: 600 }}>{worst?.symbolCode}</span>{' '}
                          <span style={{ color: pnlColor(worstPnl), fontWeight: 600 }}>
                            {money(worstPnl)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}

            {/* Account meta + single CTA */}
            <div className="dashboard-action-footer">
              <div style={{ display: 'flex', gap: 20 }}>
                <div>
                  <div className="dashboard-small-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('dashboard.marginUsed')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}><bdi dir="ltr">{marginUsed}</bdi></div>
                </div>
                <div>
                  <div className="dashboard-small-label" style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>{t('dashboard.freeMargin')}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem' }}><bdi dir="ltr">{freeMargin}</bdi></div>
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
                    color: 'var(--on-primary)',
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
                  let displayBody: string;
                  try {
                    const data = JSON.parse(n.body);
                    const bodyKey = n.title.replace(/\.[^.]+$/, '.body');
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

        <div className="table-scroll" style={{
          maxHeight: positions.length > 6 ? 340 : undefined,
          overflowY: positions.length > 6 ? 'auto' : undefined,
          borderRadius: 16,
        }}>
        <table className="table-compact table-stack">
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
                const livePrice = livePriceFor(livePrices, p.symbolCode);
                const pnlPos = pnlOf(p);
                return (
                  <tr key={p.id}>
                    <td className="font-bold stack-head">{p.symbolCode}</td>
                    <td data-label={t('table.volume')}>{fmtLots(qty)}</td>
                    <td className="dir-ltr" data-label={t('table.openPrice')}>{fmtPrice(p.avgPrice)}</td>
                    <td className="dir-ltr" data-label={t('table.currentPrice')}>
                      {livePrice ? (
                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                          {fmtPrice(livePrice)}
                        </span>
                      ) : (
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{t('common.loading')}</span>
                      )}
                    </td>
                    <td className={`font-bold dir-ltr stack-pl ${pnlPos >= 0 ? 'text-success' : 'text-danger'}`} data-label={t('table.pl')}>
                      {fmtSignedMoney(pnlPos, currency)}
                    </td>
                    <td data-label={t('table.status')}>
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
