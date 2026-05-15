import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';
import { IconCheck, IconDot, IconX } from './icons';
import { cn } from './ui';

export type ToastKind = 'success' | 'error' | 'info' | undefined;

export interface Toast {
  id: string;
  kind?: ToastKind;
  title: string;
  body?: string;
}

interface ToastContextValue {
  push: (t: Omit<Toast, 'id'>) => void;
}

const ToastCtx = createContext<ToastContextValue>({ push: () => {} });

export function useV2Toast(): ToastContextValue {
  return useContext(ToastCtx);
}

export function ToastHost({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems((s) => [...s, { id, ...t }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 3800);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto animate-slide-in flex items-start gap-3 rounded-2xl border border-hairline bg-white px-4 py-3 shadow-lg shadow-black/5"
          >
            <div
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                t.kind === 'success' && 'bg-goodsoft text-good',
                t.kind === 'error' && 'bg-badsoft text-bad',
                t.kind === 'info' && 'bg-accentsoft text-accent',
                !t.kind && 'bg-hairline text-inksoft',
              )}
            >
              {t.kind === 'success' ? (
                <IconCheck size={13} />
              ) : t.kind === 'error' ? (
                <IconX size={13} />
              ) : (
                <IconDot size={13} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.body && (
                <p className="text-xs text-inksoft mt-0.5 leading-relaxed">{t.body}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
