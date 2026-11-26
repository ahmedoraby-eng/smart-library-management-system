import { DUE_MAX_DAYS, DUE_MIN_DAYS, type LoanSortKey, type LoanStatus } from "@slm/contracts";
import type { BookStock } from "../../catalog/domain/BookStock";
import { ConflictError, ValidationError } from "../../platform/errors";

/**
 * A loan of one copy of a title to a member. Status is never stored: RETURNED when returnedAt is set,
 * OVERDUE when open and dueAt < now, else ACTIVE (architecture §3.1; derived at read time).
 */
export interface LoanView {
  id: string;
  status: LoanStatus;
  book: { id: string; title: string; author: string };
  member: { id: string; memberNumber: string; fullName: string };
  processedBy: { id: string; name: string };
  returnedBy: { id: string; name: string } | null;
  borrowedAt: Date;
  dueAt: Date;
  returnedAt: Date | null;
  /** SLM-18: set once, when the loan was renewed. */
  renewedAt: Date | null;
}

export function loanStatus(loan: { returnedAt: Date | null; dueAt: Date }, now: Date): LoanStatus {
  if (loan.returnedAt) return "RETURNED";
  return loan.dueAt.getTime() < now.getTime() ? "OVERDUE" : "ACTIVE";
}

export interface LoanPolicy {
  /** Default loan length in days (LOAN_DAYS, default 14). */
  loanDays: number;
  /** Open loans a member may hold (MAX_ACTIVE_LOANS, default 5). */
  maxActiveLoans: number;
}

const DAY_MS = 86_400_000;
/** The UI computes dueAt = now + N days when it submits; allow for the trip to the server. */
const SKEW_MS = 60 * 60_000;
const dayMonthYear = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** Due date rule (architecture §3.3, SL-04 AC2): default now + loanDays; a custom one must be 1–60 days ahead. */
export function resolveDueAt(now: Date, requested: Date | undefined, policy: Pick<LoanPolicy, "loanDays">): Date {
  if (!requested) return new Date(now.getTime() + policy.loanDays * DAY_MS);
  const ahead = requested.getTime() - now.getTime();
  if (ahead < DUE_MIN_DAYS * DAY_MS - SKEW_MS || ahead > DUE_MAX_DAYS * DAY_MS + SKEW_MS) {
    const last = dayMonthYear.format(new Date(now.getTime() + DUE_MAX_DAYS * DAY_MS));
    throw new ValidationError([{ field: "dueAt", message: `Choose a due date between tomorrow and ${last}.` }]);
  }
  return requested;
}

export interface MemberForLoan {
  id: string;
  fullName: string;
  status: "ACTIVE" | "INACTIVE";
}

export interface OpenLoanOfTitle {
  loanId: string;
  title: string;
  dueAt: Date;
}

/**
 * Borrow rules on the locked member (architecture §3.3): ACTIVE; not already holding this title;
 * under the loan limit. Stock is checked next, by catalog's guarded statement.
 */
export function checkBorrow(state: {
  member: MemberForLoan;
  openLoans: number;
  sameTitle: OpenLoanOfTitle | null;
  policy: Pick<LoanPolicy, "maxActiveLoans">;
}): void {
  const { member, openLoans, sameTitle, policy } = state;
  if (member.status !== "ACTIVE") {
    throw new ConflictError(
      "MEMBER_INACTIVE",
      "Member inactive",
      `${member.fullName} is inactive. Reactivate them on the member page first.`,
      { memberId: member.id },
    );
  }
  if (sameTitle) throw alreadyBorrowed(member.fullName, sameTitle);
  if (openLoans >= policy.maxActiveLoans) {
    throw new ConflictError(
      "LOAN_LIMIT_REACHED",
      "Loan limit reached",
      `${member.fullName} has ${openLoans} of ${policy.maxActiveLoans} books on loan. Record a return first.`,
      { activeLoans: openLoans, limit: policy.maxActiveLoans },
    );
  }
}

export function alreadyBorrowed(memberName: string | null, loan: OpenLoanOfTitle | null): ConflictError {
  if (!loan)
    return new ConflictError("ALREADY_BORROWED", "Already borrowed", "This member already has this book on loan.");
  return new ConflictError(
    "ALREADY_BORROWED",
    "Already borrowed",
    `${memberName ?? "This member"} already has '${loan.title}' on loan (due ${dayMonthYear.format(loan.dueAt)}).`,
    { loanId: loan.loanId, dueAt: loan.dueAt.toISOString() },
  );
}

export function bookUnavailable(title: string | null, nextDueAt: Date | null = null): ConflictError {
  return new ConflictError(
    "BOOK_UNAVAILABLE",
    "Book unavailable",
    title ? `No copies of '${title}' are available.` : "No copies of this book are available.",
    nextDueAt ? { nextDueAt: nextDueAt.toISOString() } : undefined,
  );
}

export function loanAlreadyReturned(state: { returnedAt: Date; returnedByName: string | null }): ConflictError {
  return new ConflictError(
    "LOAN_ALREADY_RETURNED",
    "Loan already returned",
    `This loan was already returned${state.returnedByName ? ` by ${state.returnedByName}` : ""}.`,
    { returnedAt: state.returnedAt.toISOString(), returnedBy: state.returnedByName },
  );
}

/** What a refused renewal is explained from (read after the guarded update matched no row). */
export interface RenewalState {
  dueAt: Date;
  returnedAt: Date | null;
  returnedByName: string | null;
  renewedAt: Date | null;
}

/**
 * Renewal rule (SLM-18): an open loan that is not overdue and was never renewed is extended once, by
 * the standard loan period (LOAN_DAYS) counted from its current due date. The guarded UPDATE enforces
 * it; this explains a refusal, in the order returned → already renewed → overdue.
 */
export function renewalRefused(state: RenewalState): ConflictError {
  if (state.returnedAt)
    return loanAlreadyReturned({ returnedAt: state.returnedAt, returnedByName: state.returnedByName });
  if (state.renewedAt) {
    return new ConflictError(
      "LOAN_ALREADY_RENEWED",
      "Loan already renewed",
      `This loan was already renewed on ${dayMonthYear.format(state.renewedAt)}. A loan can be renewed only once.`,
      { renewedAt: state.renewedAt.toISOString(), dueAt: state.dueAt.toISOString() },
    );
  }
  return new ConflictError(
    "LOAN_OVERDUE",
    "Loan overdue",
    `This loan was due ${dayMonthYear.format(state.dueAt)} and is overdue, so it can't be renewed. Record the return instead.`,
    { dueAt: state.dueAt.toISOString() },
  );
}

export interface NewLoan {
  bookId: string;
  memberId: string;
  processedBy: string;
  borrowedAt: Date;
  dueAt: Date;
}

/** Statements on the member and loan rows, bound to one transaction. */
export interface LoanWriter {
  /** SELECT … FOR UPDATE on the member row: serialises one member's borrows (loan-limit race). */
  lockMember(memberId: string): Promise<MemberForLoan | null>;
  countOpenLoans(memberId: string): Promise<number>;
  findOpenLoan(memberId: string, bookId: string): Promise<OpenLoanOfTitle | null>;
  insert(loan: NewLoan): Promise<string>;
  /** Guarded close: only an open loan is closed. Returns its book, or null when nothing was open. */
  close(loanId: string, staffId: string, at: Date): Promise<{ bookId: string } | null>;
  /** Explains a failed close: null = no such loan. */
  returnState(loanId: string): Promise<{ returnedAt: Date; returnedByName: string | null } | null>;
  /**
   * Guarded renewal (SLM-18), one statement: due_at += days and renewed_at/by set, only WHERE the loan is
   * open, not renewed and not overdue at `at`. Two parallel renewals: one row updated, the other none.
   * Returns false when nothing matched.
   */
  renew(loanId: string, staffId: string, at: Date, days: number): Promise<boolean>;
  /** Explains a failed renewal: null = no such loan. */
  renewalState(loanId: string): Promise<RenewalState | null>;
}

/** What a circulation transaction can touch: its own rows and catalog's stock statements. */
export interface CirculationTx {
  loans: LoanWriter;
  stock: BookStock;
}

/** Runs work in one Postgres transaction (READ COMMITTED); any throw rolls everything back. */
export interface CirculationStore {
  inTransaction<T>(work: (tx: CirculationTx) => Promise<T>): Promise<T>;
}

export interface LoanListParams {
  status?: LoanStatus;
  memberId?: string;
  bookId?: string;
  q?: string;
  from?: Date;
  to?: Date;
  /** Empty = the default order for the status (open loans: overdue first, then soonest due). */
  sort: { key: LoanSortKey; desc: boolean }[];
  page: number;
  size: number;
}

export interface LoanReader {
  findView(id: string, now: Date): Promise<LoanView | null>;
  list(params: LoanListParams, now: Date): Promise<{ items: LoanView[]; total: number }>;
}
