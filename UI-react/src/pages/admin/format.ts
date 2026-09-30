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
