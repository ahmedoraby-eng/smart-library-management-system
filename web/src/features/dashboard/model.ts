import type { DashboardSummary } from "@slm/contracts";

/** Segments of the stacked availability bar (ux.md §3.1): available / on loan / overdue, in copies. */
export function availabilitySegments(
  k: Pick<DashboardSummary["kpis"], "totalCopies" | "availableCopies" | "borrowedCopies" | "overdueLoans">,
) {
  const overdue = Math.min(k.overdueLoans, k.borrowedCopies);
  return { available: k.availableCopies, onLoan: k.borrowedCopies - overdue, overdue, total: k.totalCopies };
}

/** Whole days past due, at least 1 ("Overdue · 3 days"). */
export function daysOverdue(dueAt: string, now: number = Date.now()): number {
  return Math.max(1, Math.floor((now - new Date(dueAt).getTime()) / 86_400_000));
}

const NOTICE_KEY = "slm.dashboard.supervisorNotice.dismissed";

/** The Supervisor notice is dismissible; storage can be unavailable (private mode), so every access is guarded. */
export function isNoticeDismissed(): boolean {
  try {
    return window.localStorage.getItem(NOTICE_KEY) === "1";
  } catch {
    return false;
  }
}
export function dismissNotice(): void {
  try {
    window.localStorage.setItem(NOTICE_KEY, "1");
  } catch {
    /* not persisted; it reappears next visit, which is acceptable */
  }
}
