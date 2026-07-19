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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const dataDir = env.DATA_DIR ?? new URL("../data", import.meta.url).pathname;
  return {
    port: int(env.PORT, 3001),
    dataDir,
    gamesDir: env.GAMES_DIR ?? `${dataDir}/games`,
    llm: {
      baseUrl: env.LLM_BASE_URL ?? "http://localhost:1234/v1",
      apiKey: env.LLM_API_KEY ?? "lm-studio",
      model: env.LLM_MODEL ?? "gemma-4-26b-a4b-it",
      allowMockFallback: bool(env.LLM_ALLOW_MOCK_FALLBACK, true),
      // Local reasoning models (e.g. gemma) can spend many seconds "thinking"
      // before emitting the answer; a short timeout aborts mid-generation and
      // silently drops to the mock. Default generously; override per setup.
      timeoutMs: int(env.LLM_TIMEOUT_MS, 180_000),
    },
    blenderBin: env.BLENDER_BIN ?? "blender",
  };
}
