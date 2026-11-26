import { pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

/** Mirrors `loans` in migrations/0001_init.sql and 0006_loan_renewal.sql (constraints and indexes live in the SQL). */
export const loans = pgTable("loans", {
  id: uuid("id").primaryKey().defaultRandom(),
  bookId: uuid("book_id").notNull(),
  memberId: uuid("member_id").notNull(),
  processedBy: uuid("processed_by").notNull(),
  returnedBy: uuid("returned_by"),
  borrowedAt: timestamp("borrowed_at", { withTimezone: true }).notNull().defaultNow(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  returnedAt: timestamp("returned_at", { withTimezone: true }),
  renewedAt: timestamp("renewed_at", { withTimezone: true }),
  renewedBy: uuid("renewed_by"),
});
