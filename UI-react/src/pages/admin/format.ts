export function money(n: unknown): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '–';
  return '$' + v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function signedMoney(n: unknown): string {
  const v = Number(n ?? 0);
  const body = money(Math.abs(v));
  return (v >= 0 ? '+' : '−') + body;
}

export function num(n: unknown): number {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v : 0;
}

export function relTime(raw?: string): string {
  if (!raw) return '–';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '–';
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function isoDate(raw?: string): string {
  if (!raw) return '';
  return String(raw).replace('T', ' ').replace(/\.\d+Z?$/, '').slice(0, 19);
}

/** The clock on this machine: three hours ahead of the server, all year. */
const LOCAL_ZONE = 'Europe/Moscow';

/** Admin table clock in the local zone. Empty when the row has no timestamp. */
export function when(raw?: string): string {
  if (!raw) return '–';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return isoDate(raw) || '–';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: LOCAL_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}:${pick('second')}`;
}
