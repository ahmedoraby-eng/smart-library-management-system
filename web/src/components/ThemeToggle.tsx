import { useState } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion } from "../lib/motion";
import { cn } from "../lib/cn";
import { applyTheme, currentTheme, type Theme } from "../lib/theme";

const NEXT: Record<Theme, Theme> = { "reading-room": "plain", plain: "reading-room" };
const LABEL: Record<Theme, string> = { "reading-room": "Reading Room", plain: "plain" };

/**
 * Small, deliberately quiet button that swaps the look between "Reading Room" and "plain".
 * Placed in a corner by the caller (`className`); it never moves the layout.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const next = NEXT[theme];
  const label = `Switch to the ${LABEL[next]} theme`;
  return (
    <button
      type="button"
      onClick={() => {
        const swap = () => {
          applyTheme(next);
          flushSync(() => setTheme(next));
        };
        // Cross-fade the whole page where the browser supports view transitions; otherwise switch at once.
        const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
        if (doc.startViewTransition && !prefersReducedMotion()) doc.startViewTransition(swap);
        else swap();
      }}
      aria-label={label}
      title={label}
      data-testid="theme-toggle"
      data-theme-current={theme}
      className={cn(
        "grid h-6 w-6 place-items-center rounded-sm text-neutral-500 opacity-50 transition-[opacity,background-color,transform] duration-200 hover:bg-neutral-100 hover:opacity-100 focus-visible:opacity-100 motion-safe:active:rotate-180",
        className,
      )}
    >
      {/* Half-filled circle: the usual "change look" mark. */}
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 3.5a8.5 8.5 0 0 1 0 17Z" fill="currentColor" />
      </svg>
    </button>
  );
}
