import React, { useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { fmtMoney } from '@/lib/format';

export interface LoanOfferDetails {
  shortfall: number;
  required: number;
  cashBalance: number;
  creditLimit: number;
  dailyInterestRate: number;
  symbol: string;
  side: string;
  currency?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const LoanOfferModal: React.FC<LoanOfferDetails> = ({
  shortfall,
  required,
  cashBalance,
  creditLimit,
  dailyInterestRate,
  symbol,
  side,
  currency = 'USD',
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n();
  const pct = (dailyInterestRate * 100).toFixed(1);
  const sideLabel = t(`badge.${side.toLowerCase()}`) || side;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const row = (label: string, value: string, style?: React.CSSProperties, labelStyle?: React.CSSProperties) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10, ...style }}>
      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', ...labelStyle }}>{label}</span>
      <bdi style={{ fontWeight: 600 }}>{value}</bdi>
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="loan-offer-title"
        style={{
          maxWidth: 480,
          width: '100%',
          padding: '28px 32px',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card, #181c24)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ marginBottom: 16 }}>
          <h3 id="loan-offer-title" style={{ margin: 0, fontSize: '1.25rem' }}>{t('loanOffer.title')}</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {t('loanOffer.subtitle', { side: sideLabel, symbol })}
          </span>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
          {t('loanOffer.text')}
        </p>

        <div style={{ background: 'var(--bg-alt, #0f1218)', padding: '16px 20px', borderRadius: 12, marginBottom: 24 }}>
          {row(t('loanOffer.required'), fmtMoney(required, currency))}
          {row(t('loanOffer.cash'), fmtMoney(cashBalance, currency))}
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.3, margin: '10px 0' }} />
          {row(
            t('loanOffer.loan'),
            fmtMoney(shortfall, currency),
            { color: 'var(--blue, #409eff)', fontSize: '1.1rem' },
            { color: 'var(--blue, #409eff)', fontWeight: 600 },
          )}
          {row(t('loanOffer.rate'), t('common.pctPerDay', { pct }), { fontSize: '0.78rem', marginBottom: 4 })}
          {row(t('loanOffer.limit'), fmtMoney(creditLimit, currency), { fontSize: '0.78rem', marginBottom: 0 })}
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '12px', borderRadius: 8 }}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn btn-primary"
            style={{
              flex: 1.5,
              padding: '12px',
              borderRadius: 8,
              background: 'linear-gradient(135deg, #1976d2, #1565c0)',
              fontWeight: 600,
            }}
          >
            {t('loanOffer.accept')}
          </button>
        </div>
      </div>
    </div>
  );
};
