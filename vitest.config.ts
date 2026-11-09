import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/framework/test/**/*.test.ts"],
    environment: "node",
    // ordre aléatoire pour repérer les tests qui dépendent les uns des autres.
    sequence: { shuffle: true },
    coverage: {
      provider: "v8",
      include: ["packages/framework/src/**/*.ts"],
      exclude: ["apps/**", "**/*.d.ts"],
      reporter: ["text", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
