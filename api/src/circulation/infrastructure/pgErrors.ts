import type { AppError } from "../../platform/errors";
import { PgCode, pgError } from "../../platform/db";
import { alreadyBorrowed, bookUnavailable } from "../domain/Loan";

/**
 * SQLSTATE → domain error, in one place for circulation. These are the database backstops behind the
 * application checks; the checks normally answer first (with richer messages).
 */
export function circulationErrorFrom(e: unknown): AppError | null {
  const pe = pgError(e);
  if (!pe) return null;
  if (pe.code === PgCode.uniqueViolation && pe.constraint === "loans_open_member_book_uq")
    return alreadyBorrowed(null, null);
  if (pe.code === PgCode.checkViolation && pe.constraint === "books_copies_ck") return bookUnavailable(null);
  return null;
}
