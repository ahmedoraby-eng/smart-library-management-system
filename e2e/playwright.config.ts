import { defineConfig } from "@playwright/test";

// Smoke tests, run by `npm run e2e` (e2e/run.ts) locally and in CI (the e2e job); run.ts supplies E2E_BASE_URL
// and the demo sign-ins. A failed test keeps its Playwright trace and screenshot in test-results/e2e/, which CI
// uploads as an artifact (open a trace with `npx playwright show-trace <trace.zip>`).
export default defineConfig({
  testDir: ".",
  testMatch: "*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "../test-results/e2e",
  use: {
    baseURL: process.env.E2E_BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
