// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { availabilitySegments, daysOverdue, dismissNotice, isNoticeDismissed } from "./model";

describe("availabilitySegments", () => {
  it("splits borrowed copies into on-loan and overdue", () => {
    expect(
      availabilitySegments({ totalCopies: 412, availableCopies: 341, borrowedCopies: 71, overdueLoans: 6 }),
    ).toEqual({ available: 341, onLoan: 65, overdue: 6, total: 412 });
  });
  it("never counts more overdue loans than borrowed copies", () => {
    expect(availabilitySegments({ totalCopies: 10, availableCopies: 8, borrowedCopies: 2, overdueLoans: 5 })).toEqual({
      available: 8,
      onLoan: 0,
      overdue: 2,
      total: 10,
    });
  });
  it("an empty library is all zeros", () => {
    expect(availabilitySegments({ totalCopies: 0, availableCopies: 0, borrowedCopies: 0, overdueLoans: 0 })).toEqual({
      available: 0,
      onLoan: 0,
      overdue: 0,
      total: 0,
    });
  });
});

describe("daysOverdue", () => {
  const now = Date.UTC(2026, 10, 25, 12, 0, 0);
  it("counts whole days past the due date", () => {
    expect(daysOverdue("2026-11-22T12:00:00.000Z", now)).toBe(3);
    expect(daysOverdue("2026-11-22T13:00:00.000Z", now)).toBe(2);
  });
  it("is at least 1, even for a due date that is just passed or still ahead", () => {
    expect(daysOverdue("2026-11-25T11:00:00.000Z", now)).toBe(1);
    expect(daysOverdue("2026-12-01T00:00:00.000Z", now)).toBe(1);
  });
  it("uses the current time by default", () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    expect(daysOverdue("2026-11-20T12:00:00.000Z")).toBe(5);
    vi.useRealTimers();
  });
});

describe("supervisor notice storage", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is not dismissed until dismissNotice runs, then stays dismissed", () => {
    expect(isNoticeDismissed()).toBe(false);
    dismissNotice();
    expect(isNoticeDismissed()).toBe(true);
  });
  it("only the value 1 counts as dismissed", () => {
    window.localStorage.setItem("slm.dashboard.supervisorNotice.dismissed", "0");
    expect(isNoticeDismissed()).toBe(false);
  });
  it("storage that throws means 'not dismissed' and never crashes", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(isNoticeDismissed()).toBe(false);
    expect(() => dismissNotice()).not.toThrow();
  });
});
