// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, currentTheme, readStoredTheme, THEME_KEY } from "../lib/theme";
import { ThemeToggle } from "./ThemeToggle";

const html = document.documentElement;

beforeEach(() => {
  window.localStorage.clear();
  delete html.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe("theme (Reading Room default, plain behind a toggle)", () => {
  it("defaults to Reading Room when nothing is stored or the value is unknown", () => {
    expect(readStoredTheme()).toBe("reading-room");
    window.localStorage.setItem(THEME_KEY, "neon");
    expect(readStoredTheme()).toBe("reading-room");
    expect(currentTheme()).toBe("reading-room");
  });

  it("the toggle switches to plain and back, on <html> and in localStorage", async () => {
    html.dataset.theme = "reading-room";
    render(<ThemeToggle />);
    const btn = screen.getByTestId("theme-toggle");
    expect(btn).toHaveAccessibleName("Switch to the plain theme");

    await userEvent.click(btn);
    expect(html.dataset.theme).toBe("plain");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("plain");
    expect(btn).toHaveAccessibleName("Switch to the Reading Room theme");

    await userEvent.click(btn);
    expect(html.dataset.theme).toBe("reading-room");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("reading-room");
  });

  it("starts from the theme already on the page (set before first paint)", () => {
    html.dataset.theme = "plain";
    render(<ThemeToggle />);
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-current", "plain");
  });

  it("still switches when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    applyTheme("plain");
    expect(html.dataset.theme).toBe("plain");
  });

  it("index.html applies a stored choice before React starts, with the same key", () => {
    const file = [resolve(process.cwd(), "index.html"), resolve(process.cwd(), "web/index.html")].find((f) =>
      existsSync(f),
    )!;
    const page = readFileSync(file, "utf8");
    expect(page).toContain('<html lang="en" data-theme="reading-room">');
    const inline = /<script>([\s\S]*?)<\/script>/.exec(page)?.[1];
    expect(inline).toContain(`"${THEME_KEY}"`);
    window.localStorage.setItem(THEME_KEY, "plain");
    new Function(inline!)();
    expect(html.dataset.theme).toBe("plain");
  });
});

describe("theme switch cross-fade", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete (document as { startViewTransition?: unknown }).startViewTransition;
  });

  it("uses a view transition when the browser has one and motion is allowed", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: false, media: q }));
    const start = vi.fn((cb: () => void) => cb());
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    html.dataset.theme = "reading-room";
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(start).toHaveBeenCalledOnce();
    expect(html.dataset.theme).toBe("plain");
    expect(screen.getByTestId("theme-toggle")).toHaveAttribute("data-theme-current", "plain");
  });

  it("switches at once under reduced motion, even with view transitions", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q }));
    const start = vi.fn();
    (document as { startViewTransition?: unknown }).startViewTransition = start;
    html.dataset.theme = "reading-room";
    render(<ThemeToggle />);
    await userEvent.click(screen.getByTestId("theme-toggle"));
    expect(start).not.toHaveBeenCalled();
    expect(html.dataset.theme).toBe("plain");
  });
});
