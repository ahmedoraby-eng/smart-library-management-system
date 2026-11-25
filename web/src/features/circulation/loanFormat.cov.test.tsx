// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { addDays, daysUntil, formatTime, overdueDays, toDayInput } from "./loanFormat";

describe("loanFormat", () => {
  it("formatTime accepts an ISO string or a Date and gives HH:MM", () => {
    const d = new Date(2026, 10, 24, 9, 5);
    expect(formatTime(d)).toMatch(/^09:05$/);
    expect(formatTime(d.toISOString())).toMatch(/^09:05$/);
  });

  it("toDayInput pads month and day in local time", () => {
    expect(toDayInput(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(toDayInput(new Date(2026, 11, 25))).toBe("2026-12-25");
  });

  it("daysUntil counts whole local calendar days, ignoring the time of day", () => {
    const from = new Date(2026, 10, 24, 23, 59);
    expect(daysUntil("2026-11-25", from)).toBe(1);
    expect(daysUntil("2026-11-24", from)).toBe(0);
    expect(daysUntil("2026-11-20", from)).toBe(-4);
    expect(daysUntil("2026-12-24", from)).toBe(30);
  });

  it("daysUntil of an empty or malformed day is NaN", () => {
    expect(daysUntil("")).toBeNaN();
  });

  it("addDays moves by calendar days across a month end and does not mutate its input", () => {
    const d = new Date(2026, 10, 28);
    expect(toDayInput(addDays(d, 5))).toBe("2026-12-03");
    expect(toDayInput(addDays(d, -30))).toBe("2026-10-29");
    expect(toDayInput(d)).toBe("2026-11-28");
  });

  it("overdueDays floors whole days and never reports less than 1", () => {
    const now = new Date("2026-11-24T12:00:00.000Z");
    expect(overdueDays({ dueAt: "2026-11-20T12:00:00.000Z" }, now)).toBe(4);
    expect(overdueDays({ dueAt: "2026-11-23T11:00:00.000Z" }, now)).toBe(1);
    // due an hour ago: floor is 0, reported as 1
    expect(overdueDays({ dueAt: "2026-11-24T11:00:00.000Z" }, now)).toBe(1);
    // not yet due (clock skew): still 1, never 0 or negative
    expect(overdueDays({ dueAt: "2026-11-25T12:00:00.000Z" }, now)).toBe(1);
  });
});
