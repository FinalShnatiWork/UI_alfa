import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPostJson } from '@/lib/api';
import type { BrokerOverview, Position, NotificationItem, Transaction, BrokerOrder, AuthMeResponse } from '@/types/api';

export { useMutation, useQueryClient };

export const QK = {
  overview: ['broker', 'overview'] as const,
  positions: ['broker', 'positions'] as const,
  notifications: ['broker', 'notifications'] as const,
  transactions: ['broker', 'transactions'] as const,
  history: ['broker', 'history'] as const,
  pendingOrders: ['broker', 'orders', 'pending'] as const,
  me: ['auth', 'me'] as const,
  preferences: ['broker', 'preferences'] as const,
  livePrice: (sym: string) => ['market', 'price', sym.toUpperCase()] as const,
};

/**
 * Custom hook to invalidate React Query cache entities related to trade state.
 * The goal of this hook is to trigger refetching of positions, overview, and history.
 */
export function useInvalidateAfterTrade() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: QK.positions });
    void qc.invalidateQueries({ queryKey: QK.overview });
    void qc.invalidateQueries({ queryKey: QK.history });
  };
}

/**
 * Custom hook to fetch general trading account metadata (balance, margin, etc.).
 *
 * @returns React Query query result object
 */
export function useBrokerOverview() {
  return useQuery({
    queryKey: QK.overview,
    queryFn: () => apiGet<BrokerOverview>('/api/broker/overview'),
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    staleTime: 500,
    retry: 1,
  });
}

/**
 * Custom hook to query active open positions.
 *
 * @returns React Query query result object
 */
export function usePositions() {
  return useQuery({
    queryKey: QK.positions,
    queryFn: () => apiGet<Position[]>('/api/broker/positions'),
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    staleTime: 500,
    retry: 1,
  });
}

/**
 * Custom hook to retrieve current alerts and system notifications.
 *
 * @returns React Query query result object
 */
export function useNotifications() {
  return useQuery({
    queryKey: QK.notifications,
    queryFn: () => apiGet<NotificationItem[]>('/api/broker/notifications'),
    refetchInterval: 5000,
    staleTime: 3000,
    retry: 1,
  });
}

/**
 * Custom hook to query the deposits/withdrawals transactional history log.
 *
 * @returns React Query query result object
 */
export function useTransactions() {
  return useQuery({
    queryKey: QK.transactions,
    queryFn: () => apiGet<Transaction[]>('/api/broker/transactions'),
    staleTime: 10_000,
    retry: 1,
  });
}

/**
 * Custom hook to query live pricing quotes for a single asset symbol.
 *
 * @param symbol asset symbol string
 * @returns React Query query result object
 */
export function useLivePrice(symbol: string | null) {
  return useQuery({
    queryKey: symbol ? QK.livePrice(symbol) : ['market', 'price', '__none__'],
    queryFn: () => apiGet<{ price: number }>(`/api/market/price/${encodeURIComponent(symbol!)}`),
    enabled: !!symbol,
    staleTime: 1000,
    refetchInterval: 1000,
    retry: 0,
  });
}

const DEFAULT_WATCH_SYMBOLS = ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD', 'SOLUSD'];

/**
 * Custom hook to query live pricing quotes for an array of asset symbols.
 * Resolves queries dynamically and returns a mapping.
 *
 * @param symbols array of asset symbol codes
 * @returns record of mapping symbol string to current number price
 */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const [prices, setPrices] = useState<Record<string, number>>({});
  const mergedSymbols = Array.from(new Set([...symbols, ...DEFAULT_WATCH_SYMBOLS]));
  const symbolsKey = mergedSymbols.map((s) => s.toUpperCase()).sort().join(',');

  useEffect(() => {
    const fetchAll = async () => {
      const unique = [...new Set(mergedSymbols.map((s) => s.toUpperCase()))];
      const nextPrices: Record<string, number> = {};

      await Promise.all(
        unique.map(async (sym) => {
          try {
            const res = await apiGet<{ price: number }>(`/api/market/price/${encodeURIComponent(sym)}`);
            if (res && res.price) {
              nextPrices[sym] = Number(res.price);
            }
          } catch (e) {
            console.error(`Failed to fetch price for ${sym}`, e);
          }
        })
      );

      if (Object.keys(nextPrices).length > 0) {
        setPrices((prev) => ({
          ...prev,
          ...nextPrices,
        }));
      }
    };

    void fetchAll();
    const pollInterval = setInterval(fetchAll, 5000); // Poll backend less frequently

    // Add local jitter every 500ms for visual effect, matching ChartsPage
    const jitterInterval = setInterval(() => {
      setPrices((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const sym of Object.keys(next)) {
          const lastPriceVal = next[sym];
          if (lastPriceVal > 0) {
            const jitterPercent = sym.includes('XAU') || sym.includes('BTC') ? 0.00012 : 0.00004;
            const change = (Math.random() - 0.5) * lastPriceVal * jitterPercent;
            next[sym] = lastPriceVal + change;
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 500);

    return () => {
      clearInterval(pollInterval);
      clearInterval(jitterInterval);
    };
  }, [symbolsKey]);

  return prices;
}

/**
 * Custom hook to retrieve completed orders transaction history.
 *
 * @returns React Query query result object
 */
export function useTradeHistory() {
  return useQuery({
    queryKey: QK.history,
    queryFn: () => apiGet<BrokerOrder[]>('/api/broker/history'),
    refetchInterval: 4000,
    staleTime: 3000,
    retry: 1,
  });
}

/**
 * Custom hook to query pending orders that are still active/working.
 *
 * @returns React Query query result object
 */
export function usePendingOrders() {
  return useQuery({
    queryKey: QK.pendingOrders,
    queryFn: () => apiGet<BrokerOrder[]>('/api/broker/orders/pending'),
    refetchInterval: 3000,
    staleTime: 2000,
    retry: 1,
  });
}

/**
 * Custom hook to cancel an active pending order.
 *
 * @returns React Query mutation wrapper object
 */
export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (orderId: number) => {
      const res = await apiPostJson(`/api/broker/orders/${orderId}/cancel`, {});
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      return (await res.json()) as { ok: boolean; newBalance?: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.pendingOrders });
      void queryClient.invalidateQueries({ queryKey: QK.overview });
    },
  });
}

/**
 * Custom hook to query current authenticated user profile details.
 *
 * @returns React Query query result object
 */
export function useAuthMe() {
  return useQuery({
    queryKey: QK.me,
    queryFn: () => apiGet<AuthMeResponse>('/api/auth/me'),
    staleTime: 120_000,
    retry: 0,
  });
}

/**
 * Custom hook to load general theme and language preferences.
 *
 * @param enabled flag to trigger query
 * @returns React Query query result object
 */
export function usePreferences(enabled = true) {
  return useQuery({
    queryKey: QK.preferences,
    queryFn: () => apiGet<Record<string, string>>('/api/broker/preferences'),
    enabled,
    staleTime: 300_000,
    retry: 1,
  });
}

/**
 * Custom hook to update and persist theme or language preferences.
 *
 * @returns React Query mutation wrapper object
 */
export function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Record<string, string>) => {
      const res = await apiPostJson('/api/broker/preferences', prefs);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`preferences save failed: ${res.status} ${text}`);
      }
      return res;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.preferences });
    },
  });
}

/**
 * Custom hook to deposit or withdraw funds.
 *
 * @returns React Query mutation wrapper object
 */
export function useTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { txType: string; amount: number; method: string; note: string }) => {
      const res = await apiPostJson('/api/broker/transactions', body);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }
      return (await res.json()) as { ok: boolean; newBalance?: number };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.overview });
      void queryClient.invalidateQueries({ queryKey: QK.transactions });
    },
  });
}
