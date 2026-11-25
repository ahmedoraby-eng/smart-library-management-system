import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatDay, formatWeekdayDate, initials } from "./format";

describe("formatDate", () => {
  it("formats a Date and an ISO string the same way, with a 3-letter month", () => {
    expect(formatDate(new Date(2026, 11, 8))).toBe("8 Dec 2026");
    expect(formatDate(new Date(2026, 8, 3))).toBe("3 Sep 2026");
    expect(formatDate("2026-01-15T12:00:00")).toBe("15 Jan 2026");
  });
});

describe("formatWeekdayDate", () => {
  it("prefixes the short weekday", () => {
    expect(formatWeekdayDate(new Date(2026, 11, 8))).toBe("Tue, 8 Dec 2026");
    expect(formatWeekdayDate(new Date(2026, 10, 1))).toBe("Sun, 1 Nov 2026");
  });
});

describe("formatDay", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("omits the year in the current year", () => {
    expect(formatDay(new Date(2026, 10, 28, 12).toISOString())).toBe("28 Nov");
  });
  it("adds the year for any other year", () => {
    expect(formatDay(new Date(2025, 11, 31, 12).toISOString())).toBe("31 Dec 2025");
    expect(formatDay(new Date(2027, 0, 2, 12).toISOString())).toBe("2 Jan 2027");
  });
});

describe("initials", () => {
  it("uses the first letters of the first two words", () => {
    expect(initials("Clean Code")).toBe("CC");
    expect(initials("the pragmatic programmer")).toBe("TP");
  });
  it("uses the first two letters of a single word", () => {
    expect(initials("dune")).toBe("DU");
    expect(initials("X")).toBe("X");
  });
  it("trims and collapses whitespace", () => {
    expect(initials("  Domain   Driven  Design ")).toBe("DD");
  });
  it("falls back to ? for an empty title", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});
