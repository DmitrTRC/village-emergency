import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@village/shared": fileURLToPath(new URL("../shared/src/index.ts", import.meta.url)),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false,
  },
});
