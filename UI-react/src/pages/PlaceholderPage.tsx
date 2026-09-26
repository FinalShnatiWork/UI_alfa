import { Link } from 'react-router-dom';
import { useI18n } from '@/hooks/useI18n';

interface Props {
  title?: string;
}

/**
 * 404 Not Found fallback page.
 *
 * @param props optional title override
 * @returns 404 page element
 */
export function PlaceholderPage({ title }: Props) {
  const { t } = useI18n();
  return (
    <div className="container" style={{ maxWidth: 600, marginTop: 80 }}>
      <div className="card text-center" style={{ padding: '48px 32px' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🔍</div>
        <h2 style={{ marginBottom: 8 }}>{title ?? t('notFound.title')}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: '0.95rem' }}>
          {t('notFound.body')}
        </p>
        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-block' }}>
          {t('notFound.back')}
        </Link>
      </div>
    </div>
  );
}
