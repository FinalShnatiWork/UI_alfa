/**
 * One way to show numbers, money and dates on every client page.
 * Numbers always use the trading convention 1,234.56 (the same separator the inputs accept);
 * dates follow the selected interface language.
 */

/** Locale for every number and amount, independent of the browser. */
export const NUM_LOCALE = 'en-US';

const DATE_LOCALE: Record<string, string> = { en: 'en-GB', ru: 'ru-RU', he: 'he-IL' };

export function fmtMoney(value: unknown, currency = 'USD'): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat(NUM_LOCALE, {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function currencySymbol(currency = 'USD'): string {
  const part = new Intl.NumberFormat(NUM_LOCALE, { style: 'currency', currency: currency || 'USD' })
    .formatToParts(0)
    .find((p) => p.type === 'currency');
  return part?.value ?? currency;
}

/** "+$12.30" / "−$4.10": sign first, so the number reads the same in RTL. */
export function fmtSignedMoney(value: unknown, currency = 'USD'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : '−'}${fmtMoney(Math.abs(n), currency)}`;
}

export function fmtNumber(value: unknown, decimals = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(NUM_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Date and time without a comma, so Excel keeps the field in one column. */
export function fmtCsvDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Day and month only, for chart axes. */
export function fmtDayMonth(d: Date, lang: string): string {
  return d.toLocaleDateString(DATE_LOCALE[lang] ?? 'en-GB', { day: '2-digit', month: '2-digit' });
}

/** Day, month, year, hours and minutes in the order the language expects. */
export function fmtDateTime(iso: string | undefined | null, lang: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(DATE_LOCALE[lang] ?? 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}
