import { defineConfig } from "@playwright/test";

// Local-only smoke. Started by `npm run e2e` (e2e/run.ts), which supplies E2E_BASE_URL and the demo sign-ins.
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "../node_modules/.cache/e2e-results",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    headless: true,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
