import { databaseUrlFromEnv, runMigrations } from "./lib/db-tools";

await runMigrations(databaseUrlFromEnv());
console.log("Migrations applied.");
