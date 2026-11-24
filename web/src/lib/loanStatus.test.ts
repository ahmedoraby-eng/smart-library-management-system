import { describe, expect, it } from "vitest";
import { loanBadge } from "./loanStatus";

const now = new Date("2026-11-25T10:00:00");
const at = (days: number, hours = 0) => new Date(now.getTime() + days * 86_400_000 + hours * 3_600_000).toISOString();

describe("loanBadge (ux.md §2 status mapping)", () => {
  it("returned → neutral", () => expect(loanBadge({ status: "RETURNED", dueAt: at(-3) }, now)).toMatchObject({ variant: "neutral", label: "Returned" }));
  it("overdue shows whole days late, at least 1", () => {
    expect(loanBadge({ status: "OVERDUE", dueAt: at(-3, -1) }, now)).toMatchObject({ kind: "overdue", variant: "danger", label: "Overdue · 3 days" });
    expect(loanBadge({ status: "OVERDUE", dueAt: at(0, -2) }, now).label).toBe("Overdue · 1 day");
  });
  it("active and due within 2 days → Due soon", () => {
    expect(loanBadge({ status: "ACTIVE", dueAt: at(0, 3) }, now)).toMatchObject({ kind: "due-soon", variant: "warning", label: "Due today" });
    expect(loanBadge({ status: "ACTIVE", dueAt: at(1, 2) }, now).label).toBe("Due in 2 days");
    expect(loanBadge({ status: "ACTIVE", dueAt: at(2) }, now).kind).toBe("due-soon");
  });
  it("active and further out → Active (info)", () => expect(loanBadge({ status: "ACTIVE", dueAt: at(9) }, now)).toMatchObject({ kind: "active", variant: "info", label: "Active" }));
});
