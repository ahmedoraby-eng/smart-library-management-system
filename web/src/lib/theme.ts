/**
 * Two looks: "reading-room" (default) and "plain" (the previous one). The choice lives in localStorage
 * and on <html data-theme>. index.html sets the attribute before first paint with the same key, so the
 * page never flashes the other theme; keep THEME_KEY in step with that inline script.
 */
export type Theme = "reading-room" | "plain";

export const THEME_KEY = "slm-theme";
export const DEFAULT_THEME: Theme = "reading-room";

export const isTheme = (v: unknown): v is Theme => v === "reading-room" || v === "plain";

export function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    return isTheme(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/** The theme the page shows now (the attribute wins; it is set before React starts). */
export function currentTheme(): Theme {
  const v = document.documentElement.dataset.theme;
  return isTheme(v) ? v : readStoredTheme();
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode or storage off: the choice lasts for this page only.
  }
}
