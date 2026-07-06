import { Link } from 'react-router-dom';

interface Props {
  title: string;
}

/**
 * Simple fallback page representing non-migrated endpoints or 404 targets.
 *
 * @param props title header key string
 * @returns Placeholder fallback component
 */
export function PlaceholderPage({ title }: Props) {
  return (
    <div className="container" style={{ maxWidth: 600, marginTop: 80 }}>
      <div className="card text-center">
        <h2>{title}</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>
          This page has not been migrated to React yet.
        </p>
        <Link to="/login" className="btn btn-primary" style={{ marginTop: 20 }}>
          Go to Login
        </Link>
      </div>
    </div>
  );
}
