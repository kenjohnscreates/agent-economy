// Vitest config for @agent-town/circle. Aliases the workspace `@agent-town/shared`
// import to its TS source so tests run without a prior `pnpm -r build`.
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@agent-town/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
