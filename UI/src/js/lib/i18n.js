export const LANG_KEY = 'broker-ui-lang';

import MESSAGES from '@locales';

function allowed(code) {
  return code === 'ru' || code === 'he' || code === 'en';
}

export function getLang() {
  try {
    const v = localStorage.getItem(LANG_KEY) || 'en';
    return allowed(v) ? v : 'en';
  } catch {
    return 'en';
  }
}

export function setLang(code) {
  const lang = allowed(code) ? code : 'en';
  try {
    localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* private mode / storage blocked */
  }
  document.documentElement.lang = lang === 'he' ? 'he' : lang === 'ru' ? 'ru' : 'en';
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  applyI18n(document);
}

/** Wrap dynamic fragments in LTR isolates so tickers, amounts, UIDs stay readable in Hebrew RTL. */
function wrapHeSubstitution(value) {
  const val = String(value);
  if (!val) return val;
  return `\u2066${val}\u2069`;
}

export function t(key, vars) {
  const lang = getLang();
  let s = (MESSAGES[lang] && MESSAGES[lang][key]) || MESSAGES.en[key] || key;
  if (vars && typeof s === 'string') {
    Object.entries(vars).forEach(([k, v]) => {
      const piece = lang === 'he' ? wrapHeSubstitution(v) : String(v);
      s = s.split(`{${k}}`).join(piece);
    });
  }
  return s;
}

export function applyI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const val = t(key);
    if (val) el.textContent = val;
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (key && t(key)) el.setAttribute('placeholder', t(key));
  });
  root.querySelectorAll('[data-i18n-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-label');
    if (key && t(key)) el.setAttribute('label', t(key));
  });
  root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
    const key = el.getAttribute('data-i18n-aria-label');
    if (key && t(key)) el.setAttribute('aria-label', t(key));
  });

  const titleKey = document.body && document.body.getAttribute('data-title-i18n');
  if (titleKey) {
    document.title = t(titleKey);
  }

  document.documentElement.classList.add('i18n-ready');
}

export function applyPageTitle(key) {
  document.title = t(key);
}
