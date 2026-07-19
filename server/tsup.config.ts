import { defineConfig } from "tsup";

// Bundle the server (and the workspace `shared` sources it imports) into a
// single ESM file so production start does not depend on a build step for the
// shared package.
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: [/@ai-gamedev\/shared/],
});
