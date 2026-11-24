import { databaseUrlFromEnv, seed } from "./lib/db-tools";

const reset = process.argv.includes("--reset");
const result = await seed(databaseUrlFromEnv(), { reset });
console.log(result === "seeded" ? `Demo data loaded${reset ? " (after reset)" : ""}.` : "Catalogue not empty; skipped (use npm run reseed to reset).");
