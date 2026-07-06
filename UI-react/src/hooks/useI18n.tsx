import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Lang } from '@/types/api';
import { getLang, persistLang, translate } from '@/lib/i18n';

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/**
 * Localization Provider component for translations.
 * Sets the documentElement translation status classes and initializes the active language.
 *
 * @param props children layout elements
 * @returns I18nProvider Context element
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getLang());

  useEffect(() => {
    persistLang(lang);
    // Legacy CSS hides <body> until this class is set, to avoid flash of untranslated text.
    document.documentElement.classList.add('i18n-ready');
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const value = useMemo<I18nContextValue>(() => ({ lang, setLang, t }), [lang, setLang, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Custom hook to translate layout text strings or retrieve/change active language.
 *
 * @returns I18nContextValue containing translation helper `t` and language getters/setters
 */
export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
