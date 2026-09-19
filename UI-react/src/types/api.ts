// Backend API response types — keep in sync with Spring Boot DTOs.

export type Lang = 'en' | 'ru' | 'he';

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ApiError {
  error?: string;
  message?: string;
  status?: number;
}

export interface User {
  id: number;
  email: string;
  displayName?: string;
  role?: string;
  banned?: boolean;
  createdAt?: string;
}

export interface AuthMeResponse {
  id: number;
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  banned?: boolean;
}

export interface BrokerOverview {
  tradingAccountId: number;
  accountType: string;
  currency: string;
  leverage: number;
  balance: number | string;
  equity: number | string;
  marginUsed?: number | string;
  freeMargin?: number | string;
  borrowedBalance?: number | string;
  creditLimit?: number | string;
  marginLevelPct?: number | string | null;
  interestAccruedTotal?: number | string;
  commissionPaidTotal?: number | string;
  dailyInterestRate?: number | string;
}


export interface TradingAccount {
  id: number;
  balance: string;
  equity: string;
  currency?: string;
}

export interface Position {
  id: number;
  symbolCode: string;
  side?: 'LONG' | 'SHORT';
  quantity: string;
  avgPrice: string;
  unrealizedPnl?: string;
  realizedPnl?: string;
  openedAt?: string;
}

export interface BrokerOrder {
  id: number;
  symbolCode: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  status: 'NEW' | 'FILLED' | 'CANCELLED' | 'CANCELED' | 'REJECTED';
  quantity: string;
  limitPrice?: string;
  stopPrice?: string;
  entryPrice?: string;
  realizedPnl?: string;
  stopLoss?: string;
  takeProfit?: string;
  filledAt?: string;
  createdAt?: string;
  openPrice?: string;
  openedAt?: string;
  commission?: string;
}

export interface PlaceOrderRequest {
  symbolCode: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  limitPrice?: number;
  stopPrice?: number;
}

export interface PlaceOrderResponse {
  ok: boolean;
  orderId?: number;
  status?: string;
  fillPrice?: string;
  newBalance?: string;
  error?: string;
}

export interface ClosePositionResponse {
  ok: boolean;
  closePnl?: string;
  newBalance?: string;
  error?: string;
}

export interface NotificationItem {
  id: number;
  notifType: string;
  title: string;
  body: string;
  readAt: string | null;
  createdAt: string;
}

export interface Transaction {
  id: number;
  txType: string;
  amount: number | string;
  method?: string;
  status: string;
  createdAt?: string;
  note?: string;
}

export interface CreditLedgerEntry {
  id: number;
  entryType: string;         // BORROW | REPAY | INTEREST | LIQUIDATION
  amount: number | string;
  borrowedAfter: number | string;
  balanceAfter: number | string;
  note?: string;
  createdAt?: string;
}
