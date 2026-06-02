import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { persistLang } from '@/lib/i18n';
import type { Lang } from '@/types/api';

type Theme = 'dark' | 'light' | 'system';
const ALLOWED_LANGS: ReadonlySet<string> = new Set(['en', 'ru', 'he']);
const ALLOWED_THEMES: ReadonlySet<string> = new Set(['dark', 'light', 'system']);

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }
  localStorage.setItem('theme', theme);
}

/**
 * Loads user preferences from the DB once after successful authentication
 * and applies language + theme globally. This ensures settings are consistent
 * across devices and sessions, not just stored in localStorage.
 */
export function PreferenceSync({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { setLang } = useI18n();

  const { data: prefs } = useQuery({
    queryKey: ['preferences'],
    queryFn: () => apiGet<Record<string, string>>('/api/broker/preferences'),
    enabled: status === 'authenticated',
    staleTime: 300_000,
    retry: 1,
  });

  useEffect(() => {
    if (!prefs) return;

    // Always apply from DB so different users don't bleed into each other's settings.
    // If the user has no saved preference, fall back to safe defaults.
    if (prefs.lang && ALLOWED_LANGS.has(prefs.lang)) {
      persistLang(prefs.lang as Lang);
      setLang(prefs.lang as Lang);
    } else {
      persistLang('en');
      setLang('en');
    }

    if (prefs.theme && ALLOWED_THEMES.has(prefs.theme)) {
      applyTheme(prefs.theme as Theme);
    } else {
      applyTheme('dark');
    }
  }, [prefs, setLang]);

  return <>{children}</>;
}
