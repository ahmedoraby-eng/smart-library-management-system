import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { runMigrations } from "../../scripts/lib/db-tools";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Integration tests run on real PostgreSQL 16:
 *  - CI: TEST_DATABASE_URL points at the postgres:16 service container;
 *  - locally: an embedded PostgreSQL 16 is started in a temp dir (no Docker needed).
 */
export default async function setup(project: TestProject) {
  let url = process.env.TEST_DATABASE_URL;
  let teardown: () => Promise<void> = async () => {};
  if (!url) {
    const { default: EmbeddedPostgres } = await import("embedded-postgres");
    const dir = await mkdtemp(join(tmpdir(), "slm-pg-"));
    const port = 15432 + Math.floor(Math.random() * 1000);
    const pg = new EmbeddedPostgres({
      databaseDir: dir,
      user: "test",
      password: "test",
      port,
      persistent: false,
      onLog: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase("slm_test");
    url = `postgres://test:test@localhost:${port}/slm_test`;
    teardown = async () => {
      await pg.stop();
      await rm(dir, { recursive: true, force: true });
    };
  }
  await runMigrations(url);
  project.provide("databaseUrl", url);
  return teardown;
}
