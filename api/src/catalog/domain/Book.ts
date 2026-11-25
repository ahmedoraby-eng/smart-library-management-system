import type { BookInput, BookListQuery, BookSortKey } from "@slm/contracts";
import { ConflictError } from "../../platform/errors";

/** A catalogue title with its copy counts. Invariant: 0 ≤ availableCopies ≤ totalCopies (DB CHECK backs it). */
export interface Book {
  id: string;
  title: string;
  author: string;
  isbn: string | null;
  description: string;
  category: string;
  publisher: string;
  publicationYear: number | null;
  coverImageUrl: string | null;
  totalCopies: number;
  availableCopies: number;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

/** Read model: the book plus facts derived from its loans (computed in one query, never stored). */
export interface BookView extends Book {
  activeLoans: number;
  nextDueAt: Date | null;
  hasLoanHistory: boolean;
}

export type DeletionOutcome = "archive" | "delete";

/**
 * Delete rule (scope D3): open loans block it; past loans mean archive (history stays readable);
 * a book never borrowed is deleted.
 */
export function deletionOutcome(state: {
  title: string;
  activeLoans: number;
  hasLoanHistory: boolean;
}): DeletionOutcome {
  if (state.activeLoans > 0) {
    const n = state.activeLoans;
    throw new ConflictError(
      "BOOK_HAS_ACTIVE_LOANS",
      "Book has active loans",
      `Can't delete '${state.title}'. ${n} ${n === 1 ? "copy is" : "copies are"} on loan. Record the returns first.`,
      { activeLoans: n },
    );
  }
  return state.hasLoanHistory ? "archive" : "delete";
}

/** Total copies can't drop below the copies on loan (AC4). */
export function totalBelowLoaned(onLoan: number): ConflictError {
  return new ConflictError(
    "TOTAL_BELOW_LOANED",
    "Total below copies on loan",
    `You can't go below ${onLoan} ${onLoan === 1 ? "copy" : "copies"}: ${onLoan} ${onLoan === 1 ? "is" : "are"} on loan right now.`,
    { onLoan },
  );
}

export interface BookListParams {
  q?: string;
  category?: string;
  availability: NonNullable<BookListQuery["availability"]>;
  sort: { key: BookSortKey; desc: boolean }[];
  page: number;
  size: number;
}

/** Outcome of a guarded update; the application turns non-ok results into domain errors. */
export type UpdateResult =
  | { kind: "ok"; book: BookView }
  | { kind: "not_found" }
  | { kind: "stale" }
  | { kind: "below_loaned"; onLoan: number }
  | { kind: "duplicate_isbn"; other: { id: string; title: string } };

export type CreateResult =
  { kind: "ok"; book: BookView } | { kind: "duplicate_isbn"; other: { id: string; title: string } };

export interface BookRepository {
  findView(id: string): Promise<BookView | null>;
  list(params: BookListParams): Promise<{ items: BookView[]; total: number }>;
  categories(): Promise<string[]>;
  create(input: BookInput): Promise<CreateResult>;
  /** One guarded statement: version matches, not archived, new total ≥ copies on loan. */
  update(id: string, version: number, input: BookInput): Promise<UpdateResult>;
  /**
   * Locks the book row, reads its loan facts, asks `decide` (the domain rule), applies the outcome,
   * all in one transaction. Returns null when the book doesn't exist (or is already archived).
   */
  removeWith(
    id: string,
    decide: (state: { title: string; activeLoans: number; hasLoanHistory: boolean }) => DeletionOutcome,
  ): Promise<DeletionOutcome | null>;
}
