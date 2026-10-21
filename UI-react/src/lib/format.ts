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

/** Rounds to the shown precision first, so -0.004 is shown as 0 and never as "−0.00". */
function roundTo(n: number, decimals: number): number {
  const r = Number(n.toFixed(decimals));
  return Object.is(r, -0) ? 0 : r;
}

/** "+$12.30" / "−$4.10": sign first, so the number reads the same in RTL. Wrap it in <bdi dir="ltr"> inside RTL text. */
export function fmtSignedMoney(value: unknown, currency = 'USD'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  const r = roundTo(n, 2);
  return `${r >= 0 ? '+' : '−'}${fmtMoney(Math.abs(r), currency)}`;
}

/** Money with a true minus sign for negatives and no sign for positives ("$1.00" / "−$1.00"). */
export function fmtMoneyMinus(value: unknown, currency = 'USD'): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  const r = roundTo(n, 2);
  return r < 0 ? `−${fmtMoney(-r, currency)}` : fmtMoney(r, currency);
}

export function fmtNumber(value: unknown, decimals = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString(NUM_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "+1.25%" / "−0.40%" / "0.00%": true minus sign, and never "-0.00%". */
export function fmtSignedPct(value: unknown, decimals = 2): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  const r = roundTo(n, decimals);
  const body = Math.abs(r).toLocaleString(NUM_LOCALE, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${r > 0 ? '+' : r < 0 ? '−' : ''}${body}%`;
}

/** Trade volume in lots. The lot step is 0.01, so two decimals everywhere. */
export function fmtLots(value: unknown): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '—';
  return Math.abs(n).toLocaleString(NUM_LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Default precision for a quote when the instrument is not known: fixed within each magnitude band,
 *  so live ticks do not change the string length. */
export function priceDecimals(value: number): number {
  const abs = Math.abs(value);
  return abs < 10 ? 5 : abs < 500 ? 3 : 2;
}

/**
 * A price quote. Pass the instrument's decimals when known; otherwise the band precision is used.
 * Missing values and, with `zeroAsDash`, zero are shown as "—".
 */
export function fmtPrice(value: unknown, decimals?: number, zeroAsDash = true): string {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n) || (zeroAsDash && n === 0)) return '—';
  const d = decimals ?? priceDecimals(n);
  return n.toLocaleString(NUM_LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
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
