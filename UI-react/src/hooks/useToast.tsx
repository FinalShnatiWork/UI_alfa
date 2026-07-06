import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ToastVariant } from '@/types/api';

interface ToastItem {
  id: number;
  message: string;
  variant: ToastVariant;
  leaving: boolean;
}

interface ToastOptions {
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 4200;
const FADE_MS = 320;

/**
 * Context Provider component managing popup alert messages.
 * Mounts the dynamic fixed toast-container overlay in the viewport layout.
 *
 * @param props children layout elements
 * @returns ToastProvider Context element
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idCounter = useRef(0);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  /**
   * Internal helper to trigger transition animations and remove a toast by ID.
   *
   * @param id targeted toast identifier
   */
  const remove = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      timersRef.current.delete(id);
    }, FADE_MS);
  }, []);

  /**
   * Instantiates and schedules a new popup toast alert.
   *
   * @param message localized message string
   * @param options toast variants (info, success, danger) and custom durations
   */
  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const variant = options.variant ?? 'info';
      const duration = options.duration ?? DEFAULT_DURATION;
      idCounter.current += 1;
      const id = idCounter.current;

      // Only one toast at a time, like the legacy implementation.
      timersRef.current.forEach((handle) => clearTimeout(handle));
      timersRef.current.clear();
      setToasts([{ id, message, variant, leaving: false }]);

      const handle = setTimeout(() => remove(id), duration);
      timersRef.current.set(id, handle);
    },
    [remove],
  );

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`toast toast--${t.variant} ${t.leaving ? 'toast--out' : 'toast--visible'}`}
            onClick={() => remove(t.id)}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Custom hook to show user alerts and notification toast alerts in the viewport.
 *
 * @returns ToastContextValue containing `show` function trigger
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
