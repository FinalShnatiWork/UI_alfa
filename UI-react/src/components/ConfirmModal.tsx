import { useEffect } from 'react';
import { useI18n } from '@/hooks/useI18n';

interface ConfirmModalProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small yes/no dialog for actions that cannot be undone (close a position, cancel an order). */
export function ConfirmModal({ message, onConfirm, onCancel }: ConfirmModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <div className="card" role="dialog" aria-modal="true" style={{ maxWidth: 380, width: '90%', padding: 30, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
        <p style={{ marginBottom: 24, fontSize: '1.05rem' }}>{message}</p>
        <div className="flex-gap" style={{ justifyContent: 'center' }}>
          <button type="button" className="btn btn-danger" autoFocus onClick={onConfirm}>{t('common.confirm')}</button>
          <button type="button" className="btn btn-outline-dark" onClick={onCancel}>{t('common.cancel')}</button>
        </div>
      </div>
    </div>
  );
}
