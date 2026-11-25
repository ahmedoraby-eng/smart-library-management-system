/**
 * `npm run e2e`: a Playwright smoke against a throwaway stack, locally and in CI (the e2e job, GitHub-hosted runner).
 *  1. embedded PostgreSQL 16 in a temp dir on a free port (from 5460), migrated and seeded;
 *  2. a temp env file and temp state dir for `wrangler dev` (so rate-limit state never carries over) (a developer's .dev.vars is moved aside and restored);
 *  3. web build, then `wrangler dev` on a free port (from 8860), waits for /api/health;
 *  4. runs the specs; 5. stops the Worker and Postgres, deletes the temp dir; exits with Playwright's code.
 */
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { indexCatalogueWithFakeEmbedder, runMigrations, seed } from "../scripts/lib/db-tools";

const root = new URL("../", import.meta.url).pathname;

function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer()
      .once("error", () => resolve(freePort(preferred + 1)))
      .once("listening", () => s.close(() => resolve(preferred)))
      .listen(preferred, "127.0.0.1");
  });
}

const rand = (n: number) => randomBytes(n).toString("hex");
const tmp = mkdtempSync(join(tmpdir(), "slm-e2e-"));
let pg: EmbeddedPostgres | undefined;
let wrangler: ChildProcess | undefined;
let stopped = false;
let movedDevVars = false;
// wrangler merges .dev.vars over --env-file values, so a developer's file is moved aside for the run and put back.
const devVars = `${root}.dev.vars`;
const devVarsAside = `${root}.dev.vars.e2e-aside`;

async function cleanup(): Promise<void> {
  if (stopped) return;
  stopped = true;
  if (wrangler?.pid && wrangler.exitCode === null) {
    // The whole process group: npx -> wrangler -> workerd.
    try {
      process.kill(-wrangler.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
    await new Promise((r) => setTimeout(r, 1000));
    try {
      process.kill(-wrangler.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }
  await pg?.stop().catch(() => undefined);
  rmSync(tmp, { recursive: true, force: true });
  if (movedDevVars && existsSync(devVarsAside) && !existsSync(devVars)) renameSync(devVarsAside, devVars);
}

async function waitForHealth(url: string): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (wrangler?.exitCode !== null) throw new Error("wrangler dev exited before it was ready");
    try {
      if ((await fetch(`${url}/api/health`)).status === 200) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("Timed out waiting for /api/health");
}

async function main(): Promise<number> {
  // A run that crashed hard may have left the developer's file aside: put it back first, never overwrite it.
  if (existsSync(devVarsAside)) {
    if (existsSync(devVars)) {
      throw new Error(
        `Both .dev.vars and ${devVarsAside} exist (left by an interrupted e2e run). Keep the right one, delete the other, then rerun.`,
      );
    }
    renameSync(devVarsAside, devVars);
    console.log("note: restored .dev.vars left aside by an interrupted e2e run.");
  }
  if (existsSync(devVars)) {
    console.log("note: .dev.vars is moved aside for this run and restored at the end.");
    renameSync(devVars, devVarsAside);
    movedDevVars = true;
  }
  const pgPort = await freePort(5460);
  const appPort = await freePort(8860);
  const databaseUrl = `postgres://library:library@localhost:${pgPort}/library`;

  pg = new EmbeddedPostgres({
    databaseDir: join(tmp, "pgdata"),
    user: "library",
    password: "library",
    port: pgPort,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("library");
  await runMigrations(databaseUrl);
  await seed(databaseUrl, { reset: false });
  await indexCatalogueWithFakeEmbedder(databaseUrl);

  const vars = {
    ENVIRONMENT: "local",
    SESSION_SECRET: rand(32),
    DEMO_ACCOUNTS_ENABLED: "true",
    DEMO_LIBRARIAN_EMAIL: "librarian@demo.test",
    DEMO_LIBRARIAN_PASSWORD: rand(8),
    DEMO_ADMIN_EMAIL: "admin@demo.test",
    DEMO_ADMIN_PASSWORD: rand(8),
    AI_FAKE: "true",
    DATABASE_URL: databaseUrl,
  };
  const envFile = join(tmp, "worker.env");
  writeFileSync(
    envFile,
    Object.entries(vars)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );

  execFileSync("npm", ["run", "build", "-w", "web"], { cwd: root, stdio: "ignore" });
  wrangler = spawn(
    "npx",
    ["wrangler", "dev", "--port", String(appPort), "--env-file", envFile, "--persist-to", join(tmp, "wrangler-state")],
    {
      cwd: root,
      stdio: "ignore",
      detached: true,
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    },
  );
  const baseUrl = `http://localhost:${appPort}`;
  await waitForHealth(baseUrl);
  console.log(`e2e stack up: app ${baseUrl}, postgres :${pgPort}`);

  const pw = spawn("npx", ["playwright", "test", "-c", "e2e/playwright.config.ts"], {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      E2E_BASE_URL: baseUrl,
      E2E_BOOK_TITLE: `E2E Book ${Date.now()}`,
      E2E_SESSION_SECRET: vars.SESSION_SECRET,
      E2E_DATABASE_URL: databaseUrl,
      DEMO_LIBRARIAN_EMAIL: vars.DEMO_LIBRARIAN_EMAIL,
      DEMO_LIBRARIAN_PASSWORD: vars.DEMO_LIBRARIAN_PASSWORD,
      DEMO_ADMIN_EMAIL: vars.DEMO_ADMIN_EMAIL,
      DEMO_ADMIN_PASSWORD: vars.DEMO_ADMIN_PASSWORD,
    },
  });
  return await new Promise<number>((resolve) => pw.on("exit", (code) => resolve(code ?? 1)));
}

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => void cleanup().then(() => process.exit(130)));
}
let code = 1;
try {
  code = await main();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
} finally {
  await cleanup();
}
process.exit(code);
