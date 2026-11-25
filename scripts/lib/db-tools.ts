import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { BookIndexSync } from "../../api/src/discovery/application/BookIndexSync";
import { FakeEmbedder } from "../../api/src/discovery/infrastructure/FakeEmbedder";
import { PgChunkStore } from "../../api/src/discovery/infrastructure/PgChunkStore";

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

/**
 * SLM-16, local runs only (AI_FAKE): chunk + embed the catalogue with the deterministic fake embedder,
 * so hybrid retrieval works from the first search. Production embeds inside the Worker (Workers AI
 * binding) via the admin reindex endpoint and the nightly reset; no Cloudflare token is ever needed here.
 */
export async function indexCatalogueWithFakeEmbedder(databaseUrl: string): Promise<number> {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  try {
    const r = await new BookIndexSync(new PgChunkStore(drizzle({ client: pool })), new FakeEmbedder()).syncAll(10_000); // local: no CPU limit
    return r.embeddedBooks;
  } finally {
    await pool.end();
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
