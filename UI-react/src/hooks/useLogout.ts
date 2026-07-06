import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPostLogout } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

/**
 * Custom hook providing shared logout logic used by DashboardPage and AccountPage.
 * Clears server session, React Query cache, localStorage settings,
 * and resets DOM to defaults before navigating to /login.
 *
 * @returns object containing logout trigger function and loggingOut state flag
 */
export function useLogout() {
  const { clearUser } = useAuth();
  const navigate = useNavigate();
  const [loggingOut, setLoggingOut] = useState(false);

  /**
   * Performs the programmatic logout sequence.
   * Calls API logout endpoints, purges settings, cleans DOM elements, resets Auth status, and redirects to login view.
   */
  const logout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await apiPostLogout();
    } catch {
      // ignore server errors — always clear local state
    } finally {
      localStorage.removeItem('theme');
      localStorage.removeItem('broker-ui-lang');
      document.documentElement.setAttribute('data-theme', 'dark');
      document.documentElement.lang = 'en';
      document.documentElement.dir = 'ltr';
      clearUser();
      setLoggingOut(false);
      navigate('/login', { replace: true });
    }
  }, [clearUser, navigate]);

  return { logout, loggingOut };
}
