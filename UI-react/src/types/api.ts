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
  status: 'NEW' | 'FILLED' | 'CANCELED' | 'REJECTED';
  quantity: string;
  entryPrice?: string;
  realizedPnl?: string;
  stopLoss?: string;
  takeProfit?: string;
  filledAt?: string;
  createdAt?: string;
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
