import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const root = fileURLToPath(new URL("../../", import.meta.url).href);

/** Apply versioned SQL migrations (migrations/, journal in migrations/meta). Idempotent. */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await migrate(drizzle({ client }), { migrationsFolder: `${root}migrations` });
  } finally {
    await client.end();
  }
}

/** Load seed/demo.sql. With reset: wipe all data first. Without: only into an empty catalogue. */
export async function seed(databaseUrl: string, opts: { reset: boolean }): Promise<"seeded" | "skipped"> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("BEGIN");
    if (opts.reset) {
      await client.query("TRUNCATE loans, members, books");
      await client.query("ALTER SEQUENCE member_number_seq RESTART WITH 1");
    } else {
      const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM books");
      if ((rows[0]?.n ?? 0) > 0) {
        await client.query("ROLLBACK");
        return "skipped";
      }
    }
    await client.query(await readFile(`${root}seed/demo.sql`, "utf8"));
    await client.query("COMMIT");
    return "seeded";
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    await client.end();
  }
}

export function databaseUrlFromEnv(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. Local default: postgres://library:library@localhost:5432/library");
    process.exit(1);
  }
  return url;
}
