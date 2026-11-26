import { LOAN_SORT_KEYS, type BorrowInput, type LoanListQuery, type LoanSortKey } from "@slm/contracts";
import type { Clock } from "../../platform/clock";
import { NotFoundError } from "../../platform/errors";
import { parseSort } from "../../platform/http";
import {
  bookUnavailable,
  checkBorrow,
  loanAlreadyReturned,
  renewalRefused,
  resolveDueAt,
  type CirculationStore,
  type LoanPolicy,
  type LoanReader,
  type LoanView,
} from "../domain/Loan";

/** Calendar day "2026-11-24" = that UTC day; a day as `to` covers the whole day. */
const startOf = (v: string) => new Date(v);
const endOf = (v: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(new Date(v).getTime() + 86_400_000 - 1) : new Date(v);

/**
 * Borrow Book and Return Book (SLM-4), renewal (SLM-18) and loan reads (SLM-5). Each write is one transaction owned here;
 * the rules are the domain's, the SQL is the infrastructure's. Authorization is checked by the route guard.
 */
export class CirculationService {
  constructor(
    private readonly store: CirculationStore,
    private readonly reader: LoanReader,
    private readonly policy: LoanPolicy,
    private readonly clock: Clock,
  ) {}

  async borrow(input: BorrowInput, staffId: string): Promise<LoanView> {
    const now = this.clock();
    const dueAt = resolveDueAt(now, input.dueAt ? new Date(input.dueAt) : undefined, this.policy);

    const loanId = await this.store.inTransaction(async ({ loans, stock }) => {
      const member = await loans.lockMember(input.memberId);
      if (!member) throw new NotFoundError("This member");
      const sameTitle = await loans.findOpenLoan(member.id, input.bookId);
      const openLoans = await loans.countOpenLoans(member.id);
      checkBorrow({ member, openLoans, sameTitle, policy: this.policy });

      const taken = await stock.takeCopy(input.bookId);
      if (taken.kind === "not_found") throw new NotFoundError("This book");
      if (taken.kind === "unavailable") throw bookUnavailable(taken.title, taken.nextDueAt);

      return loans.insert({ bookId: input.bookId, memberId: member.id, processedBy: staffId, borrowedAt: now, dueAt });
    });
    return this.get(loanId);
  }

  async return(loanId: string, staffId: string): Promise<LoanView> {
    const now = this.clock();
    await this.store.inTransaction(async ({ loans, stock }) => {
      const closed = await loans.close(loanId, staffId, now);
      if (!closed) {
        const state = await loans.returnState(loanId);
        if (!state) throw new NotFoundError("This loan");
        throw loanAlreadyReturned(state);
      }
      // Accepted for an inactive member and an archived book (D4): returnCopy has no such guard.
      await stock.returnCopy(closed.bookId);
    });
    return this.get(loanId);
  }

  /** SLM-18: extend an open, not-overdue loan once by LOAN_DAYS from its current due date. */
  async renew(loanId: string, staffId: string): Promise<LoanView> {
    const now = this.clock();
    await this.store.inTransaction(async ({ loans }) => {
      if (await loans.renew(loanId, staffId, now, this.policy.loanDays)) return;
      const state = await loans.renewalState(loanId);
      if (!state) throw new NotFoundError("This loan");
      throw renewalRefused(state);
    });
    return this.get(loanId);
  }

  async get(id: string): Promise<LoanView> {
    const loan = await this.reader.findView(id, this.clock());
    if (!loan) throw new NotFoundError("This loan");
    return loan;
  }

  async list(query: LoanListQuery) {
    const sort = parseSort<LoanSortKey>(query.sort, LOAN_SORT_KEYS, []);
    const { items, total } = await this.reader.list(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.memberId ? { memberId: query.memberId } : {}),
        ...(query.bookId ? { bookId: query.bookId } : {}),
        ...(query.q ? { q: query.q } : {}),
        ...(query.from ? { from: startOf(query.from) } : {}),
        ...(query.to ? { to: endOf(query.to) } : {}),
        sort,
        page: query.page,
        size: query.size,
      },
      this.clock(),
    );
    return { items, total, page: query.page, size: query.size };
  }
}
