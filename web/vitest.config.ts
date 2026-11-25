import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Web tests run on their own (no database): `npm test -w web`. Each file opts in with
// `// @vitest-environment jsdom`. The root vitest.config.ts only covers api/ and contracts/.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    // The 90% gate for the web app: `npm run test:coverage -w web` fails below it.
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/main.tsx", "src/**/*.d.ts"],
      reporter: ["text-summary", "text", "lcov"],
      reportsDirectory: "coverage",
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});
