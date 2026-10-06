import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, onUnauthorized } from '@/lib/api';
import { getLang, translate } from '@/lib/i18n';
import { useToast } from '@/hooks/useToast';
import type { AuthMeResponse } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthMeResponse | null;
  refresh: () => Promise<void>;
  clearUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Context Provider component managing user authentication state.
 * Bootstraps initial session, registers unauthorized 401 interceptors, and shares credentials context.
 *
 * @param props children layout elements
 * @returns AuthProvider Context element
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const queryClient = useQueryClient();

  /**
   * Resets active credentials state and purges TanStack Query client cache.
   */
  const clearUser = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
    // Clear ALL cached queries so the next user doesn't see previous user's data
    queryClient.clear();
  }, [queryClient]);

  /**
   * Re-fetches the user profile from the backend to verify session validity.
   */
  const refresh = useCallback(async () => {
    try {
      const me = await apiGet<AuthMeResponse>('/api/auth/me');
      if (me) {
        setUser(me);
        setStatus('authenticated');
      } else {
        clearUser();
      }
    } catch {
      clearUser();
    }
  }, [clearUser]);

  // navigate changes identity on every route change; read it through a ref so the 401
  // handler below stays registered instead of being torn down after the first navigation.
  const statusRef = useRef<AuthStatus>(status);
  const pathRef = useRef(location.pathname);
  const navigateRef = useRef(navigate);
  useEffect(() => {
    statusRef.current = status;
    pathRef.current = location.pathname;
    navigateRef.current = navigate;
  });

  // Only a session that was actually signed in can "expire"; a guest's /api/auth/me 401
  // must not bounce them off public pages (ProtectedRoute handles private ones).
  useEffect(() => {
    const handler = () => {
      const wasSignedIn = statusRef.current === 'authenticated';
      statusRef.current = 'unauthenticated';
      clearUser();
      if (!wasSignedIn) return;
      toast.show(translate(getLang(), 'alerts.sessionExpired'), { variant: 'warning', duration: 6000 });
      navigateRef.current('/login', { replace: true, state: { from: { pathname: pathRef.current } } });
    };
    onUnauthorized.push(handler);
    return () => {
      const idx = onUnauthorized.indexOf(handler);
      if (idx !== -1) onUnauthorized.splice(idx, 1);
    };
  }, [clearUser, toast]);

  // Check auth on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, user, refresh, clearUser }),
    [status, user, refresh, clearUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Custom hook to access credentials, user profile details, and auth state helpers.
 *
 * @returns AuthContextValue containing state flags and callback actions
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
