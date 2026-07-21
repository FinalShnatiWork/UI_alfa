import React from 'react';

export interface LoanOfferDetails {
  shortfall: number;
  required: number;
  cashBalance: number;
  creditLimit: number;
  dailyInterestRate: number;
  symbol: string;
  side: string;
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
  onConfirm,
  onCancel,
}) => {
  const dailyRatePct = (dailyInterestRate * 100).toFixed(1);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'Center',
        zIndex: 9999,
        padding: 20,
      }}
    >
      <div
        className="card"
        style={{
          maxWidth: 480,
          width: '100%',
          padding: '28px 32px',
          borderRadius: 16,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
          border: '1px solid var(--border-color)',
          background: 'var(--bg-card, #181c24)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: '2rem' }}>📜</span>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.25rem' }}>Margin Loan Required</h3>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Insufficient Cash Balance for {side} {symbol}
            </span>
          </div>
        </div>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 20 }}>
          Your available cash balance is insufficient to cover the required margin for this trade.
          You can cover the shortfall using your Credit Line.
        </p>

        <div style={{ background: 'var(--bg-alt, #0f1218)', padding: '16px 20px', borderRadius: 12, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Required Margin + Fee:</span>
            <span style={{ fontWeight: 600 }}>${required.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Your Cash Balance:</span>
            <span style={{ fontWeight: 600, color: 'var(--yellow, #e6a23c)' }}>
              ${cashBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <hr style={{ borderColor: 'var(--border-color)', opacity: 0.3, margin: '10px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--blue, #409eff)', fontWeight: 600 }}>Margin Loan Needed:</span>
            <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--blue, #409eff)' }}>
              ${shortfall.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
            <span>Interest Rate:</span>
            <span>{dailyRatePct}% / day</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
            <span>Credit Limit Available:</span>
            <span>${creditLimit.toLocaleString()}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={onCancel}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '12px', borderRadius: 8 }}
          >
            Cancel
          </button>
          <button
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
            Accept Loan &amp; Trade
          </button>
        </div>
      </div>
    </div>
  );
};
