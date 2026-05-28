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
  me: ['auth', 'me'] as const,
  preferences: ['broker', 'preferences'] as const,
};

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

export function useTradeHistory() {
  return useQuery({
    queryKey: QK.history,
    queryFn: () => apiGet<BrokerOrder[]>('/api/broker/history'),
    staleTime: 60_000,
    retry: 1,
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

export function usePreferences() {
  return useQuery({
    queryKey: QK.preferences,
    queryFn: () => apiGet<Record<string, string>>('/api/broker/preferences'),
    staleTime: 300_000,
    retry: 1,
  });
}

export function useSavePreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (prefs: Record<string, string>) =>
      apiPostJson('/api/broker/preferences', prefs),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.preferences });
    },
  });
}

export function useTransactionMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { txType: string; amount: number; method: string; note: string }) =>
      apiPostJson('/api/broker/transactions', body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: QK.overview });
      void queryClient.invalidateQueries({ queryKey: QK.transactions });
    },
  });
}
