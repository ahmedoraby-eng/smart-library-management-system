import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const staffUsers = pgTable("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull(),
  role: text("role").$type<"ADMIN" | "LIBRARIAN" | "SUPERVISOR">().notNull(),
  status: text("status").$type<"ACTIVE" | "DISABLED">().notNull().default("ACTIVE"),
  isDemo: boolean("is_demo").notNull().default(false),
  googleSub: text("google_sub"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
