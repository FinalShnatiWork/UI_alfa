import { Link } from 'react-router-dom';

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
  return (
    <div className="container" style={{ maxWidth: 600, marginTop: 80 }}>
      <div className="card text-center" style={{ padding: '48px 32px' }}>
        <div style={{ fontSize: '4rem', marginBottom: 16 }}>🔍</div>
        <h2 style={{ marginBottom: 8 }}>{title ?? 'Page Not Found'}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 12, fontSize: '0.95rem' }}>
          The page you are looking for does not exist or has been moved.
        </p>
        <Link to="/dashboard" className="btn btn-primary" style={{ marginTop: 24, display: 'inline-block' }}>
          Go to Dashboard
        </Link>
      </div>
    </div>
  );
}
