import { drizzle } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { afterAll, describe, expect, it } from "vitest";
import { books } from "../src/catalog/infrastructure/schema";
import { loans } from "../src/circulation/infrastructure/schema";
import { members } from "../src/members/infrastructure/schema";
import { staffUsers } from "../src/staff/infrastructure/schema";
import { pool } from "./support";

afterAll(() => pool.end());

/**
 * Migrations are hand-written SQL; each module's Drizzle schema.ts is written by hand too.
 * Selecting every Drizzle column from each table fails if a column is missing or renamed in SQL.
 * Add each module's tables here as the module lands (catalog, members, circulation).
 */
const TABLES: Record<string, PgTable> = { staff_users: staffUsers, books, members, loans };

describe("schema parity: Drizzle schema.ts ↔ SQL migrations", () => {
  const db = drizzle({ client: pool });
  for (const [name, table] of Object.entries(TABLES)) {
    it(`${name}: every Drizzle column exists in the database`, async () => {
      await expect(db.select().from(table).limit(0)).resolves.toEqual([]);
    });
  }
});
