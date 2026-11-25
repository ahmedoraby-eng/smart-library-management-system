// @ts-check
import eslint from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/", "coverage/", "**/coverage/", "test-results/", "playwright-report/", "node_modules/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.{ts,mjs,cjs}", "*.cjs", "*.js"],
    languageOptions: { globals: { process: "readonly", console: "readonly", module: "writable", require: "readonly" } },
  },
);
