import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
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

/** Invalidate all data that changes after a trade (positions, overview, history). */
export function useInvalidateAfterTrade() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: QK.positions });
    void qc.invalidateQueries({ queryKey: QK.overview });
    void qc.invalidateQueries({ queryKey: QK.history });
  };
}

export function useBrokerOverview() {
  return useQuery({
    queryKey: QK.overview,
    queryFn: () => apiGet<BrokerOverview>('/api/broker/overview'),
    staleTime: 30_000,
    retry: 1,
  });
}

export function usePositions() {
  return useQuery({
    queryKey: QK.positions,
    queryFn: () => apiGet<Position[]>('/api/broker/positions'),
    refetchInterval: 5000,
    staleTime: 4000,
    retry: 1,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: QK.notifications,
    queryFn: () => apiGet<NotificationItem[]>('/api/broker/notifications'),
    refetchInterval: 30_000,
    staleTime: 20_000,
    retry: 1,
  });
}

export function useTransactions() {
  return useQuery({
    queryKey: QK.transactions,
    queryFn: () => apiGet<Transaction[]>('/api/broker/transactions'),
    staleTime: 60_000,
    retry: 1,
  });
}

/** Fetch a single live price — cached 5s, shared across all pages. */
export function useLivePrice(symbol: string | null) {
  return useQuery({
    queryKey: symbol ? QK.livePrice(symbol) : ['market', 'price', '__none__'],
    queryFn: () => apiGet<{ price: number }>(`/api/market/price/${encodeURIComponent(symbol!)}`),
    enabled: !!symbol,
    staleTime: 5_000,
    refetchInterval: 6_000,
    retry: 0,
  });
}

/** Fetch live prices for an array of symbols — all share the same global cache. */
export function useLivePrices(symbols: string[]): Record<string, number> {
  const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const results = useQueries({
    queries: unique.map((sym) => ({
      queryKey: QK.livePrice(sym),
      queryFn: () => apiGet<{ price: number }>(`/api/market/price/${encodeURIComponent(sym)}`),
      staleTime: 5_000,
      refetchInterval: 6_000,
      retry: 0,
    })),
  });

  const prices: Record<string, number> = {};
  unique.forEach((sym, i) => {
    const price = results[i]?.data?.price;
    if (price) prices[sym] = Number(price);
  });
  return prices;
}

export function useTradeHistory() {
  return useQuery({
    queryKey: QK.history,
    queryFn: () => apiGet<BrokerOrder[]>('/api/broker/history'),
    staleTime: 60_000,
    retry: 1,
  });
}

export function usePendingOrders() {
  return useQuery({
    queryKey: QK.pendingOrders,
    queryFn: () => apiGet<BrokerOrder[]>('/api/broker/orders/pending'),
    refetchInterval: 3000,
    staleTime: 2000,
    retry: 1,
  });
}

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

export function useAuthMe() {
  return useQuery({
    queryKey: QK.me,
    queryFn: () => apiGet<AuthMeResponse>('/api/auth/me'),
    staleTime: 120_000,
    retry: 0,
  });
}

export function usePreferences(enabled = true) {
  return useQuery({
    queryKey: QK.preferences,
    queryFn: () => apiGet<Record<string, string>>('/api/broker/preferences'),
    enabled,
    staleTime: 300_000,
    retry: 1,
  });
}

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
