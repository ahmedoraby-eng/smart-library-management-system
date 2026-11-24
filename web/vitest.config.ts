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
  },
});
