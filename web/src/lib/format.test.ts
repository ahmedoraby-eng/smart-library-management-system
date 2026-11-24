import { describe, expect, it } from "vitest";
import { formatDate, formatWeekdayDate } from "./format";

describe("SLM-7 date formats", () => {
  it("d MMM yyyy with 3-letter months, even for September", () => {
    expect(formatDate(new Date(2025, 8, 9))).toBe("9 Sep 2025");
    expect(formatDate(new Date(2026, 3, 18))).toBe("18 Apr 2026");
  });
  it("weekday form", () => {
    expect(formatWeekdayDate(new Date(2026, 11, 8))).toBe("Tue, 8 Dec 2026");
  });
});
