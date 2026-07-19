import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Centralised, validated runtime configuration.
 * All environment access happens here so the rest of the code depends on a
 * typed object rather than scattered `process.env` reads.
 */
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

/**
 * LM Studio / OpenAI-compat clients need the `/v1` prefix. Pi.dev configs often
 * store only `http://127.0.0.1:1234` — normalize so both forms work.
 */
export function normalizeLlmBaseUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

/** Load `.env` from repo root and `server/` (idempotent; never overrides real env). */
export function loadEnvFiles(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const serverDir = path.resolve(here, "..");
  const repoRoot = path.resolve(serverDir, "..");
  loadDotenv({ path: path.join(repoRoot, ".env") });
  loadDotenv({ path: path.join(serverDir, ".env") });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DATA_DIR ?? path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../data",
  );
  return {
    port: int(env.PORT, 3001),
    dataDir,
    gamesDir: env.GAMES_DIR ?? path.join(dataDir, "games"),
    llm: {
      baseUrl: normalizeLlmBaseUrl(env.LLM_BASE_URL ?? "http://localhost:1234/v1"),
      apiKey: env.LLM_API_KEY ?? "lm-studio",
      model: env.LLM_MODEL ?? "gemma-4-26b-a4b-it",
      allowMockFallback: bool(env.LLM_ALLOW_MOCK_FALLBACK, true),
      timeoutMs: int(env.LLM_TIMEOUT_MS, 120_000),
    },
    blenderBin: env.BLENDER_BIN ?? "blender",
  };
}
