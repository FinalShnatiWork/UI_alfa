import { useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { useQueryClient } from '@tanstack/react-query';
import { QK } from './useApi';
import { IS_MOCK } from '@/lib/api';
import type { NotificationItem } from '@/types/api';

/**
 * Custom hook to establish and maintain a WebSockets connection (SockJS/STOMP) for notifications.
 * Automatically pushes new message entities into the React Query cache or triggers invalidations.
 *
 * @param enabled flag to initialize WebSocket connect, defaults to true
 */
export function useNotificationsWs(enabled = true) {
  const qc = useQueryClient();
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    if (!enabled || IS_MOCK) return;

    const client = new Client({
      webSocketFactory: () => new SockJS('/ws'),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe('/user/queue/notifications', (msg) => {
          try {
            const notification = JSON.parse(msg.body) as NotificationItem;
            qc.setQueryData<NotificationItem[]>(QK.notifications, (old = []) => [
              notification,
              ...old,
            ]);
          } catch {
            qc.invalidateQueries({ queryKey: QK.notifications });
          }
        });
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
    };
  }, [enabled, qc]);
}
