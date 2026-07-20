/**
 * Human-readable startup summary printed once when the API comes up.
 * Goal: one glance tells the user which URL to open and what is offline/degraded.
 */
import type { ServerConfig } from "./config.js";
import type { BlenderProbeResult } from "./services/assetGenerator.js";

export interface StartupBannerInput {
  config: ServerConfig;
  llmReachable: boolean;
  blender: BlenderProbeResult;
  envFiles: string[];
  webPort?: number;
}

export function formatStartupBanner(input: StartupBannerInput): string {
  const webPort = input.webPort ?? 5173;
  const { config, llmReachable, blender, envFiles } = input;
  const lines: string[] = [
    "",
    "════════════════════════════════════════════════════════════",
    "  AI GameDev — ready",
    "════════════════════════════════════════════════════════════",
    "",
    `  Open the app:   http://localhost:${webPort}`,
    `  API (health):   http://localhost:${config.port}/api/health`,
    "  (Use the Vite URL above — it proxies /api to the server.)",
    "",
    "  LLM",
    `    endpoint:  ${config.llm.baseUrl}`,
    `    model:     ${config.llm.model}`,
    `    status:    ${llmReachable ? "reachable" : "NOT reachable — mock fallback will be used"}`,
    `    mock:      ${config.llm.allowMockFallback ? "enabled (offline builds still work)" : "disabled (calls fail if LLM is down)"}`,
    "",
    "  Blender (asset author)",
    blender.available
      ? `    status:    READY → ${blender.path}`
      : "    status:    NOT FOUND → procedural GLB fallback (simple shapes)",
  ];

  if (!blender.available) {
    lines.push(`    fix:       ${blender.hint ?? "Set BLENDER_BIN and restart."}`);
    if (blender.tried.length > 0) {
      const shown = blender.tried.slice(0, 4).join(" | ");
      lines.push(`    tried:     ${shown}${blender.tried.length > 4 ? " …" : ""}`);
    }
  }

  lines.push(
    "",
    "  Data",
    `    games:     ${config.gamesDir}`,
    envFiles.length > 0
      ? `    env file:  ${envFiles.join(", ")}`
      : "    env file:  (none loaded — create server/.env for BLENDER_BIN / LLM_*)",
    "",
    "════════════════════════════════════════════════════════════",
    "",
  );
  return lines.join("\n");
}
