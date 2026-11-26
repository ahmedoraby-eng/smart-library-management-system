import { BookShelf } from "./BookShelf";
import { LogoMark } from "./LogoMark";

/**
 * Branded wait while the session (/api/me) loads: the boxed "S" mark and the Smart *Library* wordmark draw in, a
 * short shelf rises spine by spine and a thin brass line runs underneath. The whole screen fades in after 150 ms,
 * so a fast load never flashes it. One polite status for screen readers; the art is hidden from them.
 * The same look is inlined in index.html for the moment before the app's script arrives.
 */
export function LoadingScreen({ testId = "loading-screen" }: { testId?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid={testId}
      className="fixed inset-0 z-40 grid place-items-center bg-spine text-spine-ink motion-safe:animate-[slm-fade-in_240ms_var(--ease-out)_150ms_backwards]"
    >
      <span className="sr-only">Loading Smart Library…</span>
      <div className="flex flex-col items-center" aria-hidden="true">
        <div className="flex items-center gap-3 motion-safe:animate-[slm-mark-in_480ms_var(--ease-out)_150ms_backwards]">
          <LogoMark large />
          <span className="font-book text-[24px] text-[#f6efe0] plain:font-semibold plain:text-neutral-900">
            Smart <i className="text-brass-200 plain:not-italic plain:text-inherit">Library</i>
          </span>
        </div>
        <BookShelf scale={0.28} count={9} className="mt-7 plain:hidden" />
        <div className="h-px w-44 bg-spine-line" />
        <div className="relative mt-3 h-0.5 w-44 overflow-hidden rounded-full bg-spine-line">
          <div
            className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brass-200 plain:bg-brand-600 motion-safe:animate-[slm-progress_1.1s_var(--ease-out)_infinite]"
            data-testid="loading-progress"
          />
        </div>
      </div>
    </div>
  );
}
