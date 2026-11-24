import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Mirrors migrations/0001_init.sql + 0002_search.sql (the generated `search` column is read-only, so it isn't mapped). */
export const books = pgTable("books", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  author: text("author").notNull(),
  isbn: text("isbn"),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  publisher: text("publisher").notNull().default(""),
  publicationYear: integer("publication_year"),
  coverImageUrl: text("cover_image_url"),
  totalCopies: integer("total_copies").notNull(),
  availableCopies: integer("available_copies").notNull(),
  version: integer("version").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
});
