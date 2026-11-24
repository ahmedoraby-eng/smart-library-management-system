import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Mirrors migrations/0001_init.sql. `member_number` has a database default (`'M-' || lpad(nextval('member_number_seq'))`), so inserts omit it. */
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberNumber: text("member_number").notNull().default(sql`('M-' || lpad(nextval('member_number_seq')::text, 6, '0'))`),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  status: text("status").$type<"ACTIVE" | "INACTIVE">().notNull().default("ACTIVE"),
  registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  version: integer("version").notNull().default(0),
});
