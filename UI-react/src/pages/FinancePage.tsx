import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';
import { useToast } from '@/hooks/useToast';
import { BackPageHeader } from '@/components/BackPageHeader';
import { SkeletonRow } from '@/components/Skeleton';
import { useBrokerOverview, useTransactions, useTransactionMutation } from '@/hooks/useApi';

type TxType = 'DEPOSIT' | 'WITHDRAWAL';

const PRESETS = [500, 1000, 5000, 10000];

function fmtMoney(n: unknown, currency = 'USD'): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(Number(n ?? 0));
}

function fmtTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

interface TxModalProps {
  type: TxType;
  currency: string;
  onClose: () => void;
  onConfirm: (amount: number, method: string) => Promise<void>;
  t: (key: string) => string;
}

function TxModal({ type, onClose, onConfirm, t }: TxModalProps) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('card');
  const [preset, setPreset] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const isDeposit = type === 'DEPOSIT';

  async function handleConfirm() {
    const val = Number(amount);
    if (!Number.isFinite(val) || val <= 0) return;
    setBusy(true);
    await onConfirm(val, method);
    setBusy(false);
  }

  function selectPreset(v: number) {
    setPreset(v);
    setAmount(String(v));
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ maxWidth: 420, width: '92%', padding: 0, overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 24px', borderBottom: '1px solid var(--border-light)',
          }}
        >
          <h3 style={{ margin: 0 }}>{isDeposit ? t('finance.deposit') : t('finance.withdraw')}</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: 'var(--text-secondary)' }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '20px 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 56, height: 56, borderRadius: '50%', fontSize: '1.6rem',
                background: isDeposit ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                color: isDeposit ? 'var(--success, #22c55e)' : 'var(--danger, #ef4444)',
                marginBottom: 8,
              }}
            >
              {isDeposit ? '↑' : '↓'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
            {PRESETS.map((v) => (
              <button
                key={v}
                type="button"
                className={`btn ${preset === v ? 'btn-primary' : 'btn-outline-dark'}`}
                style={{ flex: 1, padding: '8px 4px', fontSize: '0.9rem' }}
                onClick={() => selectPreset(v)}
              >
                ${v.toLocaleString()}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label className="font-bold">{t('finance.modalAmount')}</label>
            <div style={{ position: 'relative' }}>
              <span
                style={{
                  position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-secondary)', fontWeight: 600,
                }}
              >
                $
              </span>
              <input
                type="number"
                className="form-control"
                min={1}
                step={1}
                placeholder="0.00"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setPreset(null); }}
                style={{ paddingLeft: 28 }}
                autoFocus
              />
            </div>
          </div>

          <div className="form-group">
            <label className="font-bold">{t('finance.modalMethod')}</label>
            <select
              className="form-control"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="card">{t('finance.methodCard')}</option>
              <option value="bank">{t('finance.methodBank')}</option>
              <option value="crypto">{t('finance.methodCrypto')}</option>
            </select>
          </div>

          <p className="text-sm text-secondary" style={{ marginBottom: 20 }}>
            {isDeposit ? t('finance.modalDepositNote') : t('finance.modalWithdrawNote')}
          </p>

          <div className="flex-gap">
            <button type="button" className="btn btn-outline-dark" style={{ flex: 1 }} onClick={onClose}>
              {t('common.close')}
            </button>
            <button
              type="button"
              className={`btn ${isDeposit ? 'btn-primary' : 'btn-danger'}`}
              style={{ flex: 1 }}
              disabled={busy || !amount || Number(amount) <= 0}
              onClick={() => void handleConfirm()}
            >
              {busy ? t('common.loading') : t('finance.modalConfirm')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FinancePage() {
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();

  const [modal, setModal] = useState<TxType | null>(null);

  const { data: overview, isLoading: overviewLoading, error: overviewError } = useBrokerOverview();
  const { data: txData, isLoading: txLoading } = useTransactions();
  const txMutation = useTransactionMutation();

  const isLoading = overviewLoading || txLoading;

  useEffect(() => {
    document.title = t('titles.finance');
  }, [t]);

  useEffect(() => {
    if (overviewError && (overviewError as { status?: number })?.status === 401) {
      toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      setTimeout(() => navigate('/login'), 800);
    }
  }, [overviewError, navigate, t, toast]);

  const currency = overview?.currency || 'USD';
  const available = overview ? fmtMoney(overview.balance, currency) : '$0.00';

  const transactions = Array.isArray(txData) ? txData.slice(0, 50) : [];
  const pendingSum = transactions
    .filter((r) => r.txType.toUpperCase() === 'WITHDRAWAL' && r.status.toUpperCase() === 'PENDING')
    .reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const pendingWithdrawal = fmtMoney(pendingSum, currency);

  async function handleConfirm(amount: number, method: string) {
    const isDeposit = modal === 'DEPOSIT';
    try {
      const res = await txMutation.mutateAsync({
        txType: modal ?? 'DEPOSIT',
        amount,
        method,
        note: isDeposit ? 'Demo deposit' : 'Demo withdrawal request',
      });
      if (res.ok) {
        toast.show(
          isDeposit ? t('finance.toastDepositOk') : t('finance.toastWithdrawOk'),
          { variant: isDeposit ? 'success' : 'info' },
        );
        setModal(null);
      } else {
        toast.show(t('alerts.authNeedLogin'), { variant: 'warning' });
      }
    } catch {
      toast.show(t('finance.modalInvalidAmount'), { variant: 'error' });
    }
  }

  return (
    <>
      <BackPageHeader titleKey="finance.title" />

      {modal && (
        <TxModal
          type={modal}
          currency={currency}
          onClose={() => setModal(null)}
          onConfirm={handleConfirm}
          t={t}
        />
      )}

      <div className="container mt-20" style={{ maxWidth: 800 }}>
        <div className="stats-grid mb-20" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <div className="card stat-card mb-0">
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('finance.available')}
            </div>
            <div className="value text-primary font-bold">
              {isLoading ? '…' : available}
            </div>
          </div>
          <div className="card stat-card mb-0">
            <div className="label" style={{ color: 'var(--text-secondary)' }}>
              {t('finance.pending')}
            </div>
            <div className="value font-bold" style={{ color: 'var(--warning, #f59e0b)' }}>
              {isLoading ? '…' : pendingWithdrawal}
            </div>
          </div>
        </div>

        <div className="grid-2 mb-20">
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: 16, fontSize: '1.1rem' }}
            onClick={() => setModal('DEPOSIT')}
          >
            <span className="text-success" style={{ marginInlineEnd: 8 }}>●</span>
            {t('finance.deposit')}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            style={{ padding: 16, fontSize: '1.1rem' }}
            onClick={() => setModal('WITHDRAWAL')}
          >
            <span className="text-danger" style={{ marginInlineEnd: 8 }}>●</span>
            {t('finance.withdraw')}
          </button>
        </div>

        <div className="text-left" style={{ marginTop: 40 }}>
          <h3 className="mb-20 text-xl font-bold">{t('finance.ledger')}</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="mt-20">
              <thead>
                <tr>
                  <th>{t('table.dateTime')}</th>
                  <th>{t('table.type')}</th>
                  <th>{t('table.amount')}</th>
                  <th>{t('table.method')}</th>
                  <th>{t('table.status')}</th>
                  <th>{t('table.ref')}</th>
                </tr>
              </thead>
              <tbody>
                {txLoading ? (
                  <SkeletonRow />
                ) : transactions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted text-sm" style={{ padding: 20, textAlign: 'center' }}>
                      {t('alerts.comingSoon')}
                    </td>
                  </tr>
                ) : (
                  transactions.map((r) => {
                    const isDeposit = r.txType.toUpperCase() === 'DEPOSIT';
                    const amt = Number(r.amount ?? 0);
                    const statusUpper = r.status.toUpperCase();
                    const badgeClass =
                      statusUpper === 'APPROVED'
                        ? 'badge-success'
                        : statusUpper === 'PENDING'
                          ? 'badge-warning'
                          : 'badge-danger';

                    return (
                      <tr key={r.id}>
                        <td>{fmtTime(r.createdAt)}</td>
                        <td className={`font-bold ${isDeposit ? 'text-success' : 'text-danger'}`}>
                          {r.txType}
                        </td>
                        <td className="font-bold">
                          {isDeposit ? '+' : '-'}{fmtMoney(amt, currency)}
                        </td>
                        <td>{r.method ?? '—'}</td>
                        <td>
                          <span
                            className={`badge ${badgeClass}`}
                            style={statusUpper === 'PENDING' ? { color: '#000' } : undefined}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="text-sm dir-ltr">tx-{r.id}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
