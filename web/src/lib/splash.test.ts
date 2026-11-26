// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetSplashForTests,
  SPLASH_FADE_MS,
  SPLASH_FAILSAFE_MS,
  SPLASH_MIN_AGAIN_MS,
  SPLASH_MIN_FIRST_MS,
  SPLASH_MIN_REDUCED_MS,
  SPLASH_SEEN_KEY,
  splashReady,
  startSplash,
} from "./splash";

const mount = () => {
  document.body.innerHTML = `<div id="slm-splash" role="status"><div class="sp-bar"><i id="slm-splash-bar"></i></div><div id="slm-splash-msg">Opening the reading room…</div></div>`;
  return document.getElementById("slm-splash")!;
};
const bar = () => document.getElementById("slm-splash-bar")!.style.getPropertyValue("--p");
const msg = () => document.getElementById("slm-splash-msg")!.textContent;
const motion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), media: q }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
  sessionStorage.clear();
  motion(false);
});
afterEach(() => {
  resetSplashForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("opening screen", () => {
  it("does nothing on a page without it, and ready before start is harmless", () => {
    splashReady();
    startSplash();
    splashReady();
    expect(document.getElementById("slm-splash")).toBeNull();
  });

  it("first visit: the bar moves on, creeps while waiting, then stays the full minimum before fading out", () => {
    const el = mount();
    startSplash();
    expect(sessionStorage.getItem(SPLASH_SEEN_KEY)).toBe("1");
    expect(bar()).toBe("40%");
    expect(msg()).toBe("Checking your library card…");
    vi.advanceTimersByTime(1200);
    const crept = parseFloat(bar());
    expect(crept).toBeGreaterThan(40);
    expect(crept).toBeLessThanOrEqual(80);

    vi.mocked(performance.now).mockReturnValue(600);
    splashReady();
    expect(bar()).toBe("100%");
    expect(msg()).toBe("Ready");
    vi.advanceTimersByTime(SPLASH_MIN_FIRST_MS - 600 - 1);
    expect(el).not.toHaveClass("out");
    vi.advanceTimersByTime(1);
    expect(el).toHaveClass("out");
    expect(el).toHaveAttribute("aria-busy", "false");
    vi.advanceTimersByTime(SPLASH_FADE_MS);
    expect(document.getElementById("slm-splash")).toBeNull();
  });

  it("a reload in the same session waits less, and a second ready changes nothing", () => {
    sessionStorage.setItem(SPLASH_SEEN_KEY, "1");
    const el = mount();
    startSplash();
    splashReady();
    splashReady();
    vi.advanceTimersByTime(SPLASH_MIN_AGAIN_MS);
    expect(el).toHaveClass("out");
  });

  it("under reduced motion it leaves almost at once (never sooner than 200 ms)", () => {
    motion(true);
    const el = mount();
    startSplash();
    splashReady();
    vi.advanceTimersByTime(Math.max(200, SPLASH_MIN_REDUCED_MS) - 1);
    expect(el).not.toHaveClass("out");
    vi.advanceTimersByTime(1);
    expect(el).toHaveClass("out");
  });

  it("the fail-safe takes it down if the app never says it is ready", () => {
    const el = mount();
    startSplash();
    vi.mocked(performance.now).mockReturnValue(SPLASH_FAILSAFE_MS);
    vi.advanceTimersByTime(SPLASH_FAILSAFE_MS + 200);
    expect(el).toHaveClass("out");
  });

  it("works when session storage is unavailable (treated as a first visit)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const el = mount();
    startSplash();
    splashReady();
    vi.advanceTimersByTime(SPLASH_MIN_FIRST_MS - 1);
    expect(el).not.toHaveClass("out");
  });
});
