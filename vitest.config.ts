import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Same as wrangler's Text rule: *.sql imports are their file text.
  plugins: [
    {
      name: "sql-as-text",
      load(id) {
        if (id.endsWith(".sql")) return `export default ${JSON.stringify(readFileSync(id, "utf8"))};`;
      },
    },
  ],
  test: {
    include: ["api/test/**/*.test.ts", "contracts/**/*.test.ts"],
    globalSetup: ["api/test/global-setup.ts"],
    testTimeout: 20_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    // The 90% gate (the same bar as the other repos' CI): `npm run test:coverage` fails below it.
    coverage: {
      provider: "v8",
      include: ["api/src/**/*.ts", "contracts/src/**/*.ts"],
      exclude: ["**/*.test.ts", "**/*.d.ts"],
      reporter: ["text-summary", "text", "lcov"],
      reportsDirectory: "coverage/api",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 85 },
    },
  },
});
