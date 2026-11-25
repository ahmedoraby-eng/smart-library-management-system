import type { LoanDto } from "@slm/contracts";

const DAY = 86_400_000;
/** "Due soon" window (ux.md §2, D12: 2 days, configurable). */
export const DUE_SOON_DAYS = 2;

export type LoanBadgeKind = "returned" | "overdue" | "due-soon" | "active";
export interface LoanBadgeModel {
  kind: LoanBadgeKind;
  variant: "neutral" | "danger" | "warning" | "info";
  label: string;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const sameLocalDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * ux.md §2 status mapping. The API sends the derived status (RETURNED / OVERDUE / ACTIVE);
 * this adds the texts: "Overdue · 3 days", "Due in 2 days" / "Due today", "Active", "Returned".
 */
export function loanStatus(loan: Pick<LoanDto, "status" | "dueAt">, now: Date = new Date()): LoanBadgeModel {
  if (loan.status === "RETURNED") return { kind: "returned", variant: "neutral", label: "Returned" };
  const due = new Date(loan.dueAt);
  if (loan.status === "OVERDUE") {
    return {
      kind: "overdue",
      variant: "danger",
      label: `Overdue · ${plural(Math.max(1, Math.floor((now.getTime() - due.getTime()) / DAY)), "day")}`,
    };
  }
  const left = due.getTime() - now.getTime();
  if (left <= DUE_SOON_DAYS * DAY) {
    return {
      kind: "due-soon",
      variant: "warning",
      label: sameLocalDay(due, now) ? "Due today" : `Due in ${plural(Math.max(1, Math.ceil(left / DAY)), "day")}`,
    };
  }
  return { kind: "active", variant: "info", label: "Active" };
}

/** @deprecated name kept for older call sites; use `loanStatus`. */
export const loanBadge = loanStatus;
