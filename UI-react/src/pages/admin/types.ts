export interface AdminUser {
  id: number;
  email: string;
  displayName: string;
  role: string;
  createdAt?: string;
  banned: boolean;
  simulated?: boolean;
}

export interface AdminTrade {
  id: number;
  accountId: number;
  type: string;
  symbol: string;
  side: string;
  quantity: number | string;
  status: string;
  date?: string;
  executionRouting?: string | null;
  commission?: number | string;
}

export interface AdminAccount {
  id: number;
  userId: number;
  accountType?: string;
  leverage: number;
  status?: string;
  balance: number | string;
  equity?: number | string;
  freeMargin?: number | string;
  borrowedBalance?: number | string;
  marginLevelPct?: number | string | null;
  interestAccruedTotal?: number | string;
  commissionPaidTotal?: number | string;
  simulated?: boolean;
}

export interface AdminTx {
  id: number;
  accountId: number;
  txType: string;
  amount: number | string;
  currency?: string;
  method?: string;
  status?: string;
  createdAt?: string;
}

export interface AdminAudit {
  id: number;
  userId?: number;
  action: string;
  detail?: string;
  ip?: string;
  createdAt?: string;
}

export interface AdminLoan {
  id: number;
  accountId?: number;
  userId?: number;
  entryType: string;
  amount: number | string;
  borrowedAfter: number | string;
  balanceAfter: number | string;
  note?: string;
  createdAt?: string;
}

export interface NettingSummary {
  orders?: number;
  matches?: number;
  internalRateByQty?: number;
  commissionCollectedRealClients?: number | string;
  scheduleCommission?: number | string;
  internalFeesAvoided?: number | string;
  commissionRealClients?: number | string;
  simulatedCommissionDemoMoney?: number | string;
  externalFeesSaved?: number | string;
  externalFeesPaid?: number | string;
  allTimeExternalFeesPaid?: number | string;
  legacyExternalFees?: number | string;
  legacyFilledOrders?: number;
  brokerCashResult?: number | string;
  clientPriceImprovement?: number | string;
  brokerRevenue?: number | string;
  houseNetExposure?: Record<string, number | string>;
  venueHoldings?: VenueHolding[];
  venueValueUsd?: number | string;
  venueLegacyValueUsd?: number | string;
  simulatedRealizedPnl?: number | string;
  simulatedUnrealizedPnl?: number | string;
  legacyOrders?: number;
  simulatorEnabled?: boolean;
  limitWaitMs?: number;
}

export interface VenueHolding {
  symbol: string;
  quantity: number | string;
  legacyQuantity?: number | string;
  valueUsd?: number | string | null;
}

export interface NettingBook {
  symbol: string;
  bid?: number | string | null;
  mid?: number | string | null;
  ask?: number | string | null;
  frozen?: boolean;
  crossed?: boolean;
  buys: BookRow[];
  sells: BookRow[];
}

export interface BookRow {
  orderId: number;
  owner?: string;
  simulated?: boolean;
  side?: string;
  type?: string;
  status?: string;
  remaining?: number | string;
  limit?: number | string | null;
}

export interface InvariantRow {
  pass: boolean;
  violations?: number;
  meaning?: string;
}

export type Invariants = Record<string, InvariantRow | boolean>;
