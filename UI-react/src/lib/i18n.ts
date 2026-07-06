import MESSAGES from '@locales';
import type { Lang } from '@/types/api';

export const LANG_KEY = 'broker-ui-lang';

const ALLOWED: ReadonlySet<Lang> = new Set<Lang>(['en', 'ru', 'he']);

type LocaleDict = Record<string, string>;
type LocalesMap = Record<Lang, LocaleDict>;

const messages = MESSAGES as unknown as LocalesMap;

/**
 * Checks if language code is within ALLOWED language list.
 *
 * @param code language code identifier
 * @returns true if allowed, false otherwise
 */
function isAllowed(code: string): code is Lang {
  return ALLOWED.has(code as Lang);
}

/**
 * Reads local storage preference to determine language code.
 *
 * @returns configured active Lang code
 */
export function getLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY) ?? 'en';
    return isAllowed(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Saves language preference choice to local storage and updates document HTML directions/attributes.
 *
 * @param lang active target Lang
 */
export function persistLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode */
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
}

/**
 * Wraps dynamic insertion parameter inputs inside BiDi layout unicode characters for correct RTL rendering in Hebrew.
 *
 * @param value template replacement string
 * @returns unicode BiDi isolated string
 */
function wrapHeSubstitution(value: string): string {
  return value ? `\u2066${value}\u2069` : value;
}

/**
 * Translates message template matching key value in dynamic language locale.
 * Performs interpolation variable replacements.
 *
 * @param lang target localization Lang code
 * @param key message localization key template
 * @param vars key-value variables mapping to substitute
 * @returns resolved translated string
 */
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
