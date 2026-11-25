/**
 * No Docker? Runs a real PostgreSQL 16 from npm binaries on localhost:5432 with the same
 * credentials as docker-compose.yml. Data lives in .pgdata/ (git-ignored). Ctrl+C to stop.
 * PGPORT=5433 npm run db:local  runs a second one on another port (data in .pgdata-5433/).
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

import { createServer } from "node:net";

const port = Number(process.env.PGPORT ?? 5432);
// Refuse to start (instead of silently pointing scripts at someone else's server) if the port is taken.
await new Promise<void>((resolve) => {
  const probe = createServer()
    .once("error", () => {
      console.error(`Port ${port} is already in use. Another Postgres is running there: set PGPORT to a free port.`);
      process.exit(1);
    })
    .once("listening", () => probe.close(() => resolve()))
    .listen(port, "127.0.0.1");
});

const dir = new URL(`../.pgdata${port === 5432 ? "" : `-${port}`}`, import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "library", password: "library", port, persistent: true });
if (!existsSync(dir)) await pg.initialise();
await pg.start();
if (!existsSync(`${dir}/.slm-created`)) {
  await pg.createDatabase("library").catch(() => undefined);
  await import("node:fs/promises").then((fs) => fs.writeFile(`${dir}/.slm-created`, ""));
}
console.log(`PostgreSQL 16 running: postgres://library:library@localhost:${port}/library (Ctrl+C to stop)`);
const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
