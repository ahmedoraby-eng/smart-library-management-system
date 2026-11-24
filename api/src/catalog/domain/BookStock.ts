/**
 * The stock rule has one owner: catalog. Circulation runs these statements inside its own
 * borrow/return transaction (architecture §3.4), through an instance bound to that transaction.
 */
export type TakeCopyResult =
  | { kind: "taken" }
  /** The book doesn't exist or is archived (archived books can't be borrowed). */
  | { kind: "not_found" }
  /** No copy left right now. */
  | { kind: "unavailable"; title: string; nextDueAt: Date | null };

export interface BookStock {
  /** One guarded statement: −1 only if the book is live and has a copy (no read-then-write race). */
  takeCopy(bookId: string): Promise<TakeCopyResult>;
  /** +1, archived books included: getting books back always wins (scope D4). */
  returnCopy(bookId: string): Promise<void>;
}
