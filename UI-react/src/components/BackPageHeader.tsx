import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  titleKey: string;
  backTo?: string;
}

/**
 * Centered page header component featuring a Back navigation link.
 * Used across sub-screens like Charts, Finance, Settings, and History.
 *
 * @param props titleKey to resolve and optional backTo navigation route path
 * @returns Centered header component with Back action
 */
export function BackPageHeader({ titleKey, backTo = '/dashboard' }: Props) {
  const { t } = useI18n();

  return (
    <header className="top-nav header-centered">
      <div className="header-leading">
        <Link to={backTo} className="brand-logo-link" aria-label="Broker App">
          <img src="/images/LOGO.png?v=6" alt="" width={160} height={40} decoding="async" />
        </Link>
        <Link to={backTo} className="btn btn-outline header-back" aria-label={t('common.back')}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          <span>{t('common.back')}</span>
        </Link>
      </div>
      <h2 className="header-page-title">{t(titleKey)}</h2>
    </header>
  );
}
