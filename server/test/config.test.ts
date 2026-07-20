import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDataDir, loadConfig } from "../src/config.js";

describe("defaultDataDir", () => {
  it("returns a native filesystem path without a leading slash drive prefix", () => {
    const dir = defaultDataDir();
    expect(path.isAbsolute(dir)).toBe(true);
    expect(dir.startsWith("/C:")).toBe(false);
    expect(dir).not.toMatch(/^[A-Za-z]:[\\/][A-Za-z]:/);
    expect(dir.replace(/\\/g, "/")).toMatch(/\/server\/data$/);
  });
});

describe("loadConfig", () => {
  it("derives gamesDir from dataDir when GAMES_DIR is unset", () => {
    const dataDir = path.join("C:", "tmp", "ai-gamedev-data");
    const cfg = loadConfig({ DATA_DIR: dataDir });
    expect(cfg.gamesDir).toBe(path.join(dataDir, "games"));
  });
});
