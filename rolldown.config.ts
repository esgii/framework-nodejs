import { defineConfig } from "rolldown";

export default defineConfig({
  input: "apps/api/src/main.ts",
  platform: "node",
  external: ["pg", "bcryptjs", "jsonwebtoken"],
  output: {
    dir: "dist",
    format: "esm",
    sourcemap: true,
  },
});
