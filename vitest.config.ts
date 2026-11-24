import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same as wrangler's Text rule: *.sql imports are their file text.
  plugins: [{
    name: "sql-as-text",
    load(id) {
      if (id.endsWith(".sql")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
    },
  }],
  test: {
    include: ["api/test/**/*.test.ts", "contracts/**/*.test.ts"],
    globalSetup: ["api/test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    fileParallelism: false,
  },
});
