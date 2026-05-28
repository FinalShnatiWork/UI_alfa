import MESSAGES from '@locales';
import type { Lang } from '@/types/api';

export const LANG_KEY = 'broker-ui-lang';

const ALLOWED: ReadonlySet<Lang> = new Set<Lang>(['en', 'ru', 'he']);

type LocaleDict = Record<string, string>;
type LocalesMap = Record<Lang, LocaleDict>;

const messages = MESSAGES as unknown as LocalesMap;

function isAllowed(code: string): code is Lang {
  return ALLOWED.has(code as Lang);
}

export function getLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY) ?? 'en';
    return isAllowed(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

function wrapHeSubstitution(value: string): string {
  return value ? `\u2066${value}\u2069` : value;
}

export function translate(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  let s = messages[lang]?.[key] ?? messages.en?.[key] ?? key;
  if (vars && typeof s === 'string') {
    Object.entries(vars).forEach(([k, v]) => {
      const piece = lang === 'he' ? wrapHeSubstitution(String(v)) : String(v);
      s = s.split(`{${k}}`).join(piece);
    });
  }
  return s;
}
