import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../../lib/cn";
import { prefersReducedMotion } from "../../lib/motion";
import { AlertIcon, CheckCircleIcon, CloseIcon } from "./icons";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
  /** Sliding out; removed when the exit animation ends. */
  leaving?: boolean;
}

interface ToastApi {
  success: (message: ReactNode) => void;
  error: (message: ReactNode) => void;
  info: (message: ReactNode) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const MAX_TOASTS = 3;
const AUTO_DISMISS_MS = 4000;
const EXIT_MS = 200;

/** Bottom-right, max 3 stacked, 4 s (errors stay until closed), role=status / role=alert (ux.md §2). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const remove = useCallback((id: number) => setItems((cur) => cur.filter((t) => t.id !== id)), []);
  // With motion allowed a toast slides out first; under reduced motion it goes at once.
  const dismiss = useCallback(
    (id: number) => {
      if (prefersReducedMotion()) return remove(id);
      setItems((cur) => cur.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
      setTimeout(() => remove(id), EXIT_MS);
    },
    [remove],
  );
  const push = useCallback((kind: ToastKind, message: ReactNode) => {
    const id = nextId.current++;
    setItems((cur) => [...cur, { id, kind, message }].slice(-MAX_TOASTS));
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-60 flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <ToastView key={t.id} item={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastView({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  useEffect(() => {
    if (item.kind === "error") return;
    const t = setTimeout(() => onDismiss(item.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [item.id, item.kind, onDismiss]);

  const isError = item.kind === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      data-testid="toast"
      data-kind={item.kind}
      data-leaving={item.leaving || undefined}
      className={cn(
        "pointer-events-auto flex items-start gap-3 rounded-lg border bg-surface p-3.5 text-base shadow-pop motion-safe:animate-toast-in",
        isError ? "border-danger-200" : "border-border",
        item.leaving && "animate-[slm-toast-out_200ms_ease-in_forwards]",
      )}
    >
      {isError ? (
        <AlertIcon className="mt-0.5 text-danger-600" />
      ) : (
        <CheckCircleIcon className="mt-0.5 text-success-500" />
      )}
      <div className="min-w-0 flex-1 text-neutral-800">{item.message}</div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(item.id)}
        className="rounded-sm text-neutral-500 transition-colors duration-150 hover:text-neutral-800"
      >
        <CloseIcon size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
