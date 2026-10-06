import { useMemo, useState } from 'react';
import type { MouseEvent } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { useBrokerOverview, useCreditLedger, useTradeHistory, useTransactions } from '@/hooks/useApi';
import { dailyAccountValue } from '@/lib/equityHistory';
import { fmtDayMonth, fmtMoney, fmtSignedMoney } from '@/lib/format';

const W = 600;
const H = 160;
const PAD = 8;

/** Daily account value without open positions, so past days never change after the fact. */
export function AccountValueChart() {
  const { t, lang } = useI18n();
  const { data: overview } = useBrokerOverview();
  const { data: txData } = useTransactions();
  const { data: historyData } = useTradeHistory();
  const { data: ledgerData } = useCreditLedger();
  const [hover, setHover] = useState<number | null>(null);

  const currency = overview?.currency || 'USD';
  const settledNow = overview?.settledValue != null ? Number(overview.settledValue) : null;

  const days = useMemo(() => {
    if (settledNow == null || !Number.isFinite(settledNow)) return [];
    return dailyAccountValue(
      settledNow,
      Array.isArray(txData) ? txData : [],
      Array.isArray(historyData) ? historyData : [],
      Array.isArray(ledgerData) ? ledgerData : [],
    );
  }, [settledNow, txData, historyData, ledgerData]);

  const points = days.length === 1 ? [days[0], days[0]] : days;
  const values = points.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = max > min ? min : min - 1;
  const hi = max > min ? max : max + 1;
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / Math.max(points.length - 1, 1);
  const y = (v: number) => H - PAD - ((v - lo) * (H - 2 * PAD)) / (hi - lo);
  const line = points.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(' ');
  const area = points.length ? `${line} L${x(points.length - 1).toFixed(1)},${H} L${x(0).toFixed(1)},${H} Z` : '';

  const first = days[0]?.value ?? 0;
  const last = days[days.length - 1]?.value ?? 0;
  const change = last - first;
  const color = change >= 0 ? 'var(--green)' : 'var(--red)';
  const shown = hover != null && days[hover] ? days[hover] : days[days.length - 1];

  const onMove = (e: MouseEvent<SVGSVGElement>) => {
    if (days.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(days.length - 1, Math.round(frac * (days.length - 1)))));
  };

  return (
    <div className="card mb-20" style={{ padding: '20px 24px' }}>
      <div className="flex-between" style={{ marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>{t('dashboard.valueChart.title')}</h3>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            {t('dashboard.valueChart.hint')}
          </div>
        </div>
        {shown && (
          <div style={{ textAlign: 'end' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{fmtMoney(shown.value, currency)}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {fmtDayMonth(shown.day, lang)}
              {hover == null && days.length > 1 && (
                <>
                  {' · '}
                  <span style={{ color }}>
                    {t('dashboard.valueChart.change', { days: days.length })}:{' '}
                    <bdi dir="ltr">{fmtSignedMoney(change, currency)}</bdi>
                  </span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {days.length === 0 ? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '24px 0', textAlign: 'center' }}>
          {t('dashboard.valueChart.empty')}
        </div>
      ) : (
        <div dir="ltr">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            width="100%"
            height={H}
            role="img"
            aria-label={t('dashboard.valueChart.title')}
            onMouseMove={onMove}
            onMouseLeave={() => setHover(null)}
            style={{ display: 'block', cursor: days.length > 1 ? 'crosshair' : 'default' }}
          >
            <path d={area} fill={color} opacity={0.12} />
            <path d={line} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            {hover != null && (
              <line
                x1={x(hover)} x2={x(hover)} y1={0} y2={H}
                stroke="var(--text-secondary)" strokeDasharray="3 3" vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>
          <div
            className="flex-between"
            style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: 4 }}
          >
            <span>{fmtDayMonth(days[0].day, lang)}</span>
            <span>
              {fmtMoney(min, currency)} – {fmtMoney(max, currency)}
            </span>
            <span>{fmtDayMonth(days[days.length - 1].day, lang)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
