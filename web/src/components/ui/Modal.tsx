import { type ReactNode, type RefObject, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal (480 px): role=dialog, focus trapped, Esc = cancel, focus returns to the opener.
 * Initial focus goes to `initialFocusRef` when given (the safe button of destructive dialogs),
 * otherwise to the first focusable element. The scrim does not close the dialog: a stray
 * click must not discard a decision.
 */
export function Modal({
  title,
  children,
  footer,
  onClose,
  initialFocusRef,
  testId,
}: {
  title: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const target = initialFocusRef?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
    // Focus is set once on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/40 p-4 motion-safe:animate-fade-in"
      onKeyDown={onKeyDown}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={testId}
        className="w-full max-w-120 rounded-xl border border-border bg-surface p-6 shadow-pop motion-safe:animate-dialog-in"
      >
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        <div className="mt-3 text-base text-neutral-700">{children}</div>
        <div className="mt-6 flex justify-end gap-2">{footer}</div>
      </div>
    </div>,
    document.body,
  );
}

/** [Cancel] [Action]. Destructive dialogs focus Cancel first; non-destructive focus the action. */
export function ConfirmDialog({
  title,
  children,
  cancelLabel = "Cancel",
  confirmLabel,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
  testId,
}: {
  title: string;
  children: ReactNode;
  cancelLabel?: string;
  confirmLabel: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  testId?: string;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={title}
      onClose={loading ? () => undefined : onCancel}
      initialFocusRef={destructive ? cancelRef : confirmRef}
      testId={testId}
      footer={
        <>
          <Button ref={cancelRef} onClick={onCancel} disabled={loading} data-testid="dialog-cancel">
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            data-testid="dialog-confirm"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Modal>
  );
}
