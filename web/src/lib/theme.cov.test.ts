// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyTheme, currentTheme, DEFAULT_THEME, isTheme, readStoredTheme, THEME_KEY } from "./theme";

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});
afterEach(() => vi.restoreAllMocks());

describe("isTheme", () => {
  it("accepts only the two known looks", () => {
    expect(isTheme("reading-room")).toBe(true);
    expect(isTheme("plain")).toBe(true);
    for (const bad of ["dark", "", null, undefined, 1, {}]) expect(isTheme(bad)).toBe(false);
  });
});

describe("readStoredTheme", () => {
  it("defaults to Reading Room when nothing is stored", () => {
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });
  it("returns the stored theme", () => {
    window.localStorage.setItem(THEME_KEY, "plain");
    expect(readStoredTheme()).toBe("plain");
  });
  it("ignores a stored value it does not know", () => {
    window.localStorage.setItem(THEME_KEY, "neon");
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });
  it("falls back to the default when storage throws (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(readStoredTheme()).toBe(DEFAULT_THEME);
  });
});

describe("currentTheme", () => {
  it("prefers the attribute on <html> over storage", () => {
    window.localStorage.setItem(THEME_KEY, "reading-room");
    document.documentElement.dataset.theme = "plain";
    expect(currentTheme()).toBe("plain");
  });
  it("uses storage when the attribute is missing or invalid", () => {
    window.localStorage.setItem(THEME_KEY, "plain");
    expect(currentTheme()).toBe("plain");
    document.documentElement.dataset.theme = "bogus";
    expect(currentTheme()).toBe("plain");
  });
});

describe("applyTheme", () => {
  it("sets the attribute and stores the choice", () => {
    applyTheme("plain");
    expect(document.documentElement.dataset.theme).toBe("plain");
    expect(window.localStorage.getItem(THEME_KEY)).toBe("plain");
  });
  it("still switches the page when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => applyTheme("plain")).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("plain");
  });
});
