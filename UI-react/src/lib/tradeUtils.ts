/**
 * Shared trade pairing utilities used by HistoryPage and PositionsPage.
 * Pairs BUY opening orders with SELL closing orders (FIFO per symbol)
 * to produce a flat list of completed round-trip trades.
 */

import type { BrokerOrder, Position } from '@/types/api';
import { getContractSize } from '@/lib/api';

export function livePriceFor(prices: Record<string, number>, symbol: string): number | undefined {
  const p = prices[symbol.toUpperCase()] ?? prices[symbol];
  return p && p > 0 ? p : undefined;
}

/**
 * Floating P/L of an open position at the live mid (same basis as the server's equity).
 * Without a live price, falls back to the server's last unrealizedPnl.
 */
export function positionPnl(
  p: Pick<Position, 'symbolCode' | 'side' | 'quantity' | 'avgPrice' | 'unrealizedPnl'>,
  livePrice: number | undefined,
): number {
  const avg = Number(p.avgPrice ?? 0);
  if (!livePrice || !avg) return Number(p.unrealizedPnl ?? 0);
  const qty = Math.abs(Number(p.quantity ?? 0));
  return (p.side === 'SHORT' ? -1 : 1) * (livePrice - avg) * qty * getContractSize(p.symbolCode);
}

/** Same split as backend TradingFees.isCrypto. */
export function isCryptoSymbol(symbol: string): boolean {
  const s = symbol.toUpperCase();
  return s.includes('BTC') || s.includes('ETH') || s.includes('SOL') || s.includes('XRP');
}

/** Platform spread per side, matches backend PriceSpread.SPREAD_RATE. */
export const SPREAD_RATE = 0.00015;

/** Client commission per fill, matches backend TradingFees.CLIENT_PER_LOT and CLIENT_RATE. */
export const COMMISSION_PER_LOT = 7;
export const CRYPTO_COMMISSION_RATE = 0.002;
/** On a winning close, open + close commission never exceeds this share of gross profit. */
export const PROFIT_FEE_CAP = 0.2;

/** Matches backend MarginLoanService. */
export const CREDIT_LIMIT = 10000;
export const DAILY_INTEREST_RATE = 0.005;
export const MARGIN_CALL_LEVEL_PCT = 110;
export const LIQUIDATION_LEVEL_PCT = 100;
export const LEVERAGE = 100;

export interface OrderCost {
  units: number;
  notional: number;
  margin: number;
  commission: number;
  total: number;
}

/** Mirrors the backend reservation: notional / leverage plus the client commission for one fill. */
export function estimateOrderCost(symbol: string, lots: number, price: number, leverage: number): OrderCost {
  const units = lots * getContractSize(symbol);
  const notional = units * price;
  const margin = notional / (leverage > 0 ? leverage : LEVERAGE);
  const commission = isCryptoSymbol(symbol) ? notional * CRYPTO_COMMISSION_RATE : lots * COMMISSION_PER_LOT;
  return { units, notional, margin, commission, total: margin + commission };
}

/**
 * True when SL/TP sit on the correct side of the reference price
 * (BUY: SL below, TP above; SELL: the opposite). Empty values are allowed.
 */
export function stopsAreValid(side: 'BUY' | 'SELL', price: number, stopLoss?: number, takeProfit?: number): boolean {
  if (stopLoss != null && (!(stopLoss > 0) || (side === 'BUY' ? stopLoss >= price : stopLoss <= price))) return false;
  if (takeProfit != null && (!(takeProfit > 0) || (side === 'BUY' ? takeProfit <= price : takeProfit >= price))) return false;
  return true;
}

/** Volume rules, same as backend ContractSpecs. */
export const MIN_LOTS = 0.01;
export const MAX_LOTS = 100;

export function volumeError(lots: number): 'range' | 'step' | null {
  if (!(lots >= MIN_LOTS && lots <= MAX_LOTS)) return 'range';
  if (Math.abs(lots * 100 - Math.round(lots * 100)) > 1e-6) return 'step';
  return null;
}

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
 * Closing orders (those that carry the position's open price or point at the position) are
 * matched to their corresponding opening order FIFO by symbol. Netting fills write
 * realizedPnl = 0 on opening orders too, so realizedPnl alone does not mark a close.
 */
export function pairOrders(orders: BrokerOrder[]): PairedTrade[] {
  const sorted = [...orders].sort(
    (a, b) => tsMs(a.filledAt || a.createdAt) - tsMs(b.filledAt || b.createdAt)
  );

  const isClosing = (o: BrokerOrder) => o.openPrice != null || o.closesPositionId != null;
  const closing = sorted.filter(isClosing);
  const opening = sorted.filter((o) => !isClosing(o));

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

    // realizedPnl = gross − open fee − close fee, so with both prices the round trip's fees
    // follow exactly from the close itself; FIFO matching by symbol can pick an opening
    // order of a different size and is only the fallback.
    let commission = Number(match?.commission ?? 0) + Number(sell.commission ?? 0);
    const qty = Number(sell.quantity ?? 0);
    const open = Number(openPrice ?? 0);
    const close = Number(sell.entryPrice ?? 0);
    if (sell.realizedPnl != null && open > 0 && close > 0 && qty > 0) {
      const gross = (sell.side === 'SELL' ? 1 : -1) * (close - open) * qty * getContractSize(sell.symbolCode);
      commission = Math.max(0, gross - Number(sell.realizedPnl));
    }

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
      commission: commission.toFixed(2),
    });
  }

  return pairs.sort((a, b) => tsMs(b.closeTime) - tsMs(a.closeTime));
}
