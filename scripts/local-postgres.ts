/**
 * No Docker? Runs a real PostgreSQL 16 from npm binaries on localhost:5432 with the same
 * credentials as docker-compose.yml. Data lives in .pgdata/ (git-ignored). Ctrl+C to stop.
 */
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = new URL("../.pgdata", import.meta.url).pathname;
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "library", password: "library", port: 5432, persistent: true });
if (!existsSync(dir)) await pg.initialise();
await pg.start();
if (!existsSync(`${dir}/.slm-created`)) {
  await pg.createDatabase("library").catch(() => undefined);
  await import("node:fs/promises").then((fs) => fs.writeFile(`${dir}/.slm-created`, ""));
}
console.log("PostgreSQL 16 running: postgres://library:library@localhost:5432/library (Ctrl+C to stop)");
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
