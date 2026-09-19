/**
 * Shared trade pairing utilities used by HistoryPage and PositionsPage.
 * Pairs BUY opening orders with SELL closing orders (FIFO per symbol)
 * to produce a flat list of completed round-trip trades.
 */

import type { BrokerOrder } from '@/types/api';

export interface PairedTrade {
  id: number;
  symbolCode: string;
  quantity: string;
  openTime?: string;
  openPrice?: string;
  closeTime?: string;
  closePrice?: string;
  stopLoss?: string;
  takeProfit?: string;
  realizedPnl?: string;
  /** Sum of opening + closing leg commissions. Present only when at least one leg had a commission. */
  commission?: string;
}

/** Convert ISO timestamp string to milliseconds (returns 0 for missing/invalid). */
export function tsMs(iso?: string): number {
  return iso ? new Date(iso).getTime() : 0;
}

/**
 * Pairs a flat list of BrokerOrders into completed round-trip trades.
 * Closing orders (those with realizedPnl or openPrice set) are matched to
 * their corresponding opening order FIFO by symbol.
 */
export function pairOrders(orders: BrokerOrder[]): PairedTrade[] {
  const sorted = [...orders].sort(
    (a, b) => tsMs(a.filledAt || a.createdAt) - tsMs(b.filledAt || b.createdAt)
  );

  const closing = sorted.filter(
    (o) => o.realizedPnl != null || o.openPrice != null
  );
  const opening = sorted.filter(
    (o) => o.realizedPnl == null && o.openPrice == null
  );

  const usedOpeningIds = new Set<number>();
  const pairs: PairedTrade[] = [];

  for (const sell of closing) {
    let openPrice = sell.openPrice;
    let openTime = sell.openedAt;

    // Find the matching opening order to get its open price, time, and commission.
    const openSide = sell.side === 'SELL' ? 'BUY' : 'SELL';
    const match = opening.find(
      (o) =>
        o.symbolCode === sell.symbolCode &&
        o.side === openSide &&
        !usedOpeningIds.has(o.id)
    );
    if (match) {
      openPrice = openPrice || match.entryPrice;
      openTime = openTime || match.filledAt || match.createdAt;
      usedOpeningIds.add(match.id);
    }

    const openCommission = Number(match?.commission ?? 0);
    const closeCommission = Number(sell.commission ?? 0);

    pairs.push({
      id: sell.id,
      symbolCode: sell.symbolCode,
      quantity: sell.quantity,
      openTime,
      openPrice,
      closeTime: sell.filledAt || sell.createdAt,
      closePrice: sell.entryPrice,
      stopLoss: sell.stopLoss,
      takeProfit: sell.takeProfit,
      realizedPnl: sell.realizedPnl,
      commission: (openCommission + closeCommission).toFixed(2),
    });
  }

  return pairs.sort((a, b) => tsMs(b.closeTime) - tsMs(a.closeTime));
}
