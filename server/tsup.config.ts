import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  // Bundle the workspace shared package into the server output.
  noExternal: ["@ai-gamedev/shared"],
});
