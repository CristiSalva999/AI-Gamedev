import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDataDir, loadConfig } from "../src/config.js";

describe("defaultDataDir", () => {
  it("returns a native filesystem path without a leading slash drive prefix", () => {
    const dir = defaultDataDir();
    expect(path.isAbsolute(dir)).toBe(true);
    // Windows regression: URL.pathname yields `/C:/...` which fs turns into `C:\C:\...`.
    expect(dir.startsWith("/C:")).toBe(false);
    expect(dir).not.toMatch(/^[A-Za-z]:[\\/][A-Za-z]:/);
    expect(dir.replace(/\\/g, "/")).toMatch(/\/server\/data$/);
  });
});

describe("loadConfig", () => {
  it("honours DATA_DIR and GAMES_DIR overrides", () => {
    const cfg = loadConfig({
      DATA_DIR: "C:\\tmp\\ai-gamedev-data",
      GAMES_DIR: "C:\\tmp\\ai-gamedev-games",
      PORT: "4000",
    });
    expect(cfg.dataDir).toBe("C:\\tmp\\ai-gamedev-data");
    expect(cfg.gamesDir).toBe("C:\\tmp\\ai-gamedev-games");
    expect(cfg.port).toBe(4000);
  });

  it("derives gamesDir from dataDir when GAMES_DIR is unset", () => {
    const dataDir = path.join("C:", "tmp", "ai-gamedev-data");
    const cfg = loadConfig({ DATA_DIR: dataDir });
    expect(cfg.gamesDir).toBe(path.join(dataDir, "games"));
  });

  it("defaults allowMockFallback to true", () => {
    const cfg = loadConfig({});
    expect(cfg.llm.allowMockFallback).toBe(true);
  });
});
