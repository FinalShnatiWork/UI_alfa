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
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiGet, onUnauthorized } from '@/lib/api';
import type { AuthMeResponse } from '@/types/api';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthMeResponse | null;
  refresh: () => Promise<void>;
  clearUser: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthMeResponse | null>(null);
  const navigate = useNavigate();
  const registeredRef = useRef(false);
  const queryClient = useQueryClient();

  const clearUser = useCallback(() => {
    setUser(null);
    setStatus('unauthenticated');
    // Clear ALL cached queries so the next user doesn't see previous user's data
    queryClient.clear();
  }, [queryClient]);

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

  // Register 401 handler once
  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;
    const handler = () => {
      clearUser();
      navigate('/login', { replace: true });
    };
    onUnauthorized.push(handler);
    return () => {
      const idx = onUnauthorized.indexOf(handler);
      if (idx !== -1) onUnauthorized.splice(idx, 1);
    };
  }, [clearUser, navigate]);

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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
