import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { getLang, persistLang } from '@/lib/i18n';
import { usePreferences } from '@/hooks/useApi';
import type { Lang } from '@/types/api';

type Theme = 'dark' | 'light' | 'system';
const ALLOWED_LANGS: ReadonlySet<string> = new Set(['en', 'ru', 'he']);
const ALLOWED_THEMES: ReadonlySet<string> = new Set(['dark', 'light', 'system']);

/**
 * Helper utility to programmatically apply the selected UI theme to documentElement attributes.
 * Also persists the choice to localStorage.
 *
 * @param theme target theme style choice
 */
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
 * Sync component that loads user preferences from the DB once after successful authentication
 * and applies language + theme globally. This ensures settings are consistent
 * across devices and sessions.
 *
 * @param props children layout elements
 * @returns Sync context wrapper element
 */
export function PreferenceSync({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const { setLang } = useI18n();

  // Reuse the same query key as usePreferences() so both share the same cache entry.
  // Guard with status so we don't fire a 401 request before login.
  const { data: prefs } = usePreferences(status === 'authenticated');

  useEffect(() => {
    if (!prefs) return;

    // Always apply from DB so different users don't bleed into each other's settings.
    // Without a saved language, keep the one the visitor already picked before logging in.
    const lang = prefs.lang && ALLOWED_LANGS.has(prefs.lang) ? (prefs.lang as Lang) : getLang();
    persistLang(lang);
    setLang(lang);

    if (prefs.theme && ALLOWED_THEMES.has(prefs.theme)) {
      applyTheme(prefs.theme as Theme);
    } else {
      applyTheme('dark');
    }
  }, [prefs, setLang]);

  return <>{children}</>;
}
