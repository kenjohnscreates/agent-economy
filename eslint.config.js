// Root ESLint flat config (ESLint 9). Applies typescript-eslint "recommended"
// to every TS source in the workspace; packages run `eslint .` from their dir.
// Kept minimal on purpose — tighten rules per-package as code lands.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "packages/contracts/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    rules: {
      // AGENT-RUNBOOK §4: no `any` without a comment — surface as error.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
);
