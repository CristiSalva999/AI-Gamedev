import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { blenderMissingHint } from "../src/services/assetGenerator.js";
import { formatStartupBanner } from "../src/startupBanner.js";

describe("formatStartupBanner", () => {
  it("highlights the Vite URL to open and Blender fix when missing", () => {
    const banner = formatStartupBanner({
      config: loadConfig({
        PORT: "3001",
        DATA_DIR: "C:\\DEV\\AI-Gamedev\\server\\data",
        GAMES_DIR: "C:\\DEV\\AI-Gamedev\\server\\data\\games",
      }),
      llmReachable: true,
      blender: {
        available: false,
        tried: ["blender", "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe"],
        hint: blenderMissingHint("blender"),
      },
      envFiles: [],
      webPort: 5173,
    });

    expect(banner).toContain("Open the app:   http://localhost:5173");
    expect(banner).toContain("API (health):   http://localhost:3001/api/health");
    expect(banner).toContain("NOT FOUND → procedural GLB fallback");
    expect(banner).toContain("server/.env");
    expect(banner).toContain("Blender 5.2");
    expect(banner).toContain("env file:  (none loaded");
  });

  it("shows READY and the resolved path when Blender is available", () => {
    const path =
      "C:\\Program Files\\Blender Foundation\\Blender 5.2\\blender.exe";
    const banner = formatStartupBanner({
      config: loadConfig({ PORT: "3001", DATA_DIR: "/tmp/data", GAMES_DIR: "/tmp/games" }),
      llmReachable: false,
      blender: { available: true, path, tried: [path] },
      envFiles: ["C:\\DEV\\AI-Gamedev\\server\\.env"],
      webPort: 5173,
    });
    expect(banner).toContain(`READY → ${path}`);
    expect(banner).toContain("NOT reachable");
    expect(banner).toContain("server\\.env");
  });
});

describe("blenderMissingHint", () => {
  it("mentions server/.env and blender.exe on Windows wording", () => {
    const hint = blenderMissingHint("blender");
    expect(hint.toLowerCase()).toContain("blender");
    expect(hint).toMatch(/BLENDER_BIN|Install Blender/);
  });
});
