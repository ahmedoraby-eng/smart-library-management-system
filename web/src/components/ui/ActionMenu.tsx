import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../../lib/cn";
import { MoreIcon } from "./icons";

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: ReactNode;
  danger?: boolean;
  onSelect: () => void;
}

/**
 * The `…` row menu (ux.md §2 Table). Rendered in a portal with fixed position so a scrolling
 * table wrapper never clips it. Arrow keys move, Esc closes and returns focus to the button.
 */
export function ActionMenu({ label, items, testId }: { label: string; items: ActionMenuItem[]; testId?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const els = Array.from(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const i = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      close(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      els[(i + 1) % els.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      els[(i - 1 + els.length) % els.length]?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  if (items.length === 0) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid={testId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-grid h-8 w-8 place-items-center rounded-md border border-transparent text-neutral-600 hover:bg-neutral-100"
      >
        <MoreIcon />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={label}
            onKeyDown={onKeyDown}
            style={{
              position: "fixed",
              top: pos?.top ?? 0,
              right: pos?.right ?? 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className="z-50 min-w-40 rounded-lg border border-border bg-surface p-1 shadow-pop"
          >
            {items.map((it) => (
              <button
                key={it.key}
                type="button"
                role="menuitem"
                tabIndex={-1}
                data-testid={`menu-${it.key}`}
                onClick={(e) => {
                  e.stopPropagation();
                  close(false);
                  it.onSelect();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-base hover:bg-neutral-50",
                  it.danger ? "text-danger-700" : "text-neutral-700",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
