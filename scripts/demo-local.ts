/**
 * One command to try the app locally: `npm run demo:local`.
 *  1. starts PostgreSQL 16 (embedded, no Docker) on a free port, data in .pgdata-demo/;
 *  2. applies migrations and loads the demo seed (only into an empty catalogue);
 *  3. writes .dev.vars on first run (random session secret and demo passwords; git-ignored);
 *  4. builds the UI and runs the Worker locally on a free port;
 *  5. prints the URL and the two demo sign-ins. Ctrl+C stops everything.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { indexCatalogueWithFakeEmbedder, runMigrations, seed } from "./lib/db-tools";

const root = new URL("../", import.meta.url).pathname;

function freePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer()
      .once("error", () => resolve(freePort(preferred + 1)))
      .once("listening", () => s.close(() => resolve(preferred)))
      .listen(preferred, "127.0.0.1");
  });
}

const pgPort = await freePort(5440);
const appPort = await freePort(8790);
const dataDir = `${root}.pgdata-demo`;
const databaseUrl = `postgres://library:library@localhost:${pgPort}/library`;

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "library", password: "library", port: pgPort, persistent: true, onLog: () => {} });
const firstRun = !existsSync(dataDir);
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase("library");
await runMigrations(databaseUrl);
const seeded = await seed(databaseUrl, { reset: false });
await indexCatalogueWithFakeEmbedder(databaseUrl); // SLM-16: hybrid retrieval index (fake embedder, AI_FAKE)

// .dev.vars: created once with random values, then reused; the database URL always follows this run's port.
const varsPath = `${root}.dev.vars`;
const rand = (n: number) => randomBytes(n).toString("hex");
let vars: Record<string, string> = {};
if (existsSync(varsPath)) {
  for (const line of readFileSync(varsPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]!] = m[2]!;
  }
}
vars = {
  ENVIRONMENT: "local",
  SESSION_SECRET: rand(32),
  DEMO_ACCOUNTS_ENABLED: "true",
  DEMO_LIBRARIAN_EMAIL: "librarian@demo.test",
  DEMO_LIBRARIAN_PASSWORD: rand(8),
  DEMO_ADMIN_EMAIL: "admin@demo.test",
  DEMO_ADMIN_PASSWORD: rand(8),
  AI_FAKE: "true",
  ...vars,
  DATABASE_URL: databaseUrl,
};
writeFileSync(varsPath, Object.entries(vars).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");

execFileSync("npm", ["run", "build", "-w", "web"], { cwd: root, stdio: "ignore" });
const wrangler = spawn("npx", ["wrangler", "dev", "--port", String(appPort)], { cwd: root, stdio: ["ignore", "pipe", "inherit"] });

wrangler.stdout.on("data", (chunk: Buffer) => {
  if (!chunk.toString().includes("Ready on")) return;
  console.log(`
  Smart Library is running: http://localhost:${appPort}
  Database: ${seeded === "seeded" ? "demo data loaded" : "existing data kept"} (Admin → «Reset demo data» restores it)

  Demo Librarian  ${vars.DEMO_LIBRARIAN_EMAIL}  /  ${vars.DEMO_LIBRARIAN_PASSWORD}
  Demo Admin      ${vars.DEMO_ADMIN_EMAIL}  /  ${vars.DEMO_ADMIN_PASSWORD}
  (local values from .dev.vars; AI discovery uses the local fake model)

  Ctrl+C to stop.`);
});

const stop = async () => {
  wrangler.kill("SIGINT");
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
