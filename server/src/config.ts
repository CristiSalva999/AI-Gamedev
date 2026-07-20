/**
 * Centralised, validated runtime configuration.
 * All environment access happens here so the rest of the code depends on a
 * typed object rather than scattered `process.env` reads.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface ServerConfig {
  port: number;
  dataDir: string;
  gamesDir: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
    allowMockFallback: boolean;
    /** Milliseconds before an LLM request is aborted. */
    timeoutMs: number;
  };
  blenderBin: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function int(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Default data dir next to the compiled/source module (Windows-safe). */
export function defaultDataDir(moduleUrl: string = import.meta.url): string {
  // `.pathname` on `file:` URLs yields `/C:/...` on Windows; fs then mkdir's `C:\C:\...`.
  return fileURLToPath(new URL("../data", moduleUrl));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DATA_DIR ?? defaultDataDir();
  return {
    port: int(env.PORT, 3001),
    dataDir,
    gamesDir: env.GAMES_DIR ?? path.join(dataDir, "games"),
    llm: {
      baseUrl: env.LLM_BASE_URL ?? "http://localhost:1234/v1",
      apiKey: env.LLM_API_KEY ?? "lm-studio",
      model: env.LLM_MODEL ?? "gemma-4-26b-a4b-it",
      allowMockFallback: bool(env.LLM_ALLOW_MOCK_FALLBACK, true),
      timeoutMs: int(env.LLM_TIMEOUT_MS, 30_000),
    },
    blenderBin: env.BLENDER_BIN ?? "blender",
  };
}
