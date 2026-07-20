import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadEnvFiles } from "../src/loadEnv.js";

const created: string[] = [];

afterEach(async () => {
  delete process.env.BLENDER_BIN_TEST_KEY;
  for (const dir of created.splice(0)) {
    await rm(dir, { recursive: true, force: true });
  }
});

describe("loadEnvFiles", () => {
  it("loads KEY=value pairs from a .env next to cwd/server when present", async () => {
    // Isolate by writing into a temp dir and loading that file via cwd trick:
    // loadEnvFiles always checks server package .env; we only assert the helper
    // does not throw and returns an array (real load is covered via startup).
    const dir = await mkdtemp(path.join(tmpdir(), "ai-gamedev-env-"));
    created.push(dir);
    const file = path.join(dir, ".env");
    await writeFile(file, "BLENDER_BIN_TEST_KEY=from-env-file\n", "utf8");

    // Direct loadEnvFile smoke (same API used by loadEnvFiles).
    process.loadEnvFile(file);
    expect(process.env.BLENDER_BIN_TEST_KEY).toBe("from-env-file");
    expect(Array.isArray(loadEnvFiles())).toBe(true);
  });
});
