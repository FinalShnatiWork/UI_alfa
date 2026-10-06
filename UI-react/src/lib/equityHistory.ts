import type { BrokerOrder, CreditLedgerEntry, Transaction } from '@/types/api';

export interface DayValue {
  /** Local midnight of the day. */
  day: Date;
  /** Account value at the end of that day. */
  value: number;
}

interface Movement {
  ms: number;
  delta: number;
}

function ms(iso: string | undefined | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function nextDay(t: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/**
 * Everything that changes the settled account value: deposits, approved withdrawals, the net
 * result of each closed trade (both commissions already deducted), credit interest and debt the
 * broker wrote off.
 */
function movements(transactions: Transaction[], orders: BrokerOrder[], ledger: CreditLedgerEntry[]): Movement[] {
  const moves: Movement[] = [];
  for (const tx of transactions) {
    const type = (tx.txType || '').toUpperCase();
    const status = (tx.status || '').toUpperCase();
    const amount = Number(tx.amount ?? 0);
    if (type === 'DEPOSIT' && (status === 'APPROVED' || status === 'COMPLETED')) {
      const t = ms(tx.processedAt) ?? ms(tx.createdAt);
      if (t != null) moves.push({ ms: t, delta: amount });
    } else if (type === 'WITHDRAWAL' && status === 'APPROVED') {
      const t = ms(tx.processedAt) ?? ms(tx.createdAt);
      if (t != null) moves.push({ ms: t, delta: -amount });
    }
  }
  for (const o of orders) {
    if (o.realizedPnl == null) continue;
    const t = ms(o.filledAt) ?? ms(o.createdAt);
    if (t != null) moves.push({ ms: t, delta: Number(o.realizedPnl) });
  }
  for (const e of ledger) {
    const type = (e.entryType || '').toUpperCase();
    const amount = Number(e.amount ?? 0);
    const t = ms(e.createdAt);
    if (t == null || !amount) continue;
    if (type === 'INTEREST') moves.push({ ms: t, delta: -amount });
    else if (type === 'LIQUIDATION') moves.push({ ms: t, delta: amount });
  }
  return moves;
}

/**
 * Settled account value (no floating P/L) at the end of each day, rebuilt backwards from the
 * server's current value: a past day is today's value minus everything that happened after it.
 * Starting from the present keeps the opening demo balance and any admin balance edit outside
 * the movements from breaking the curve.
 */
export function dailyAccountValue(
  settledNow: number,
  transactions: Transaction[],
  orders: BrokerOrder[],
  ledger: CreditLedgerEntry[],
  maxDays = 60,
  now = Date.now(),
): DayValue[] {
  const moves = movements(transactions, orders, ledger).filter((m) => m.ms <= now);
  const today = startOfDay(now);
  const oldest = moves.reduce((min, m) => Math.min(min, m.ms), now);
  // One day before the first movement, so the curve starts from the value before any of them.
  const dayBeforeOldest = new Date(startOfDay(oldest));
  dayBeforeOldest.setDate(dayBeforeOldest.getDate() - 1);
  const windowStart = new Date(today);
  windowStart.setDate(windowStart.getDate() - (maxDays - 1));
  const firstDay = Math.max(dayBeforeOldest.getTime(), windowStart.getTime());

  const days: number[] = [];
  for (let d = firstDay; d <= today; d = nextDay(d)) days.push(d);

  moves.sort((a, b) => b.ms - a.ms);
  const out: DayValue[] = [];
  let value = settledNow;
  let i = 0;
  for (let k = days.length - 1; k >= 0; k--) {
    const end = nextDay(days[k]);
    for (; i < moves.length && moves[i].ms >= end; i++) value -= moves[i].delta;
    out.push({ day: new Date(days[k]), value });
  }
  return out.reverse();
}
