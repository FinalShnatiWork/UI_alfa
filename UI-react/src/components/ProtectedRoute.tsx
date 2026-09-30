import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';

interface Props {
  children: ReactNode;
  /** When set, a signed-in user with a different role is sent to the client dashboard. */
  role?: string;
}

/**
 * Route protector wrapper component.
 * Validates active session status and redirects unauthenticated users to the login route path.
 *
 * @param props children layout elements to guard
 * @returns Guarded children layout or spinner loader
 */
export function ProtectedRoute({ children, role }: Props) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            border: '3px solid var(--border-light)',
            borderTopColor: 'var(--primary)',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }}
        />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Loading...</span>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (role && user?.role !== role) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
