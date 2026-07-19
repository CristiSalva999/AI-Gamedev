import type {
  GameContext,
  GenerateAssetResponse,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "@ai-gamedev/shared";

/**
 * Thin, typed client for the orchestration API. Uses same-origin `/api/*`
 * paths, which Vite proxies to the backend in dev.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${detail}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => json<HealthResponse>("/api/health"),
  getContext: () => json<GameContext>("/api/context"),
  saveContext: (context: GameContext) =>
    json<GameContext>("/api/context", {
      method: "POST",
      body: JSON.stringify(context),
    }),
  generate: (req: GenerateRequest) =>
    json<GenerateResponse>("/api/generate", {
      method: "POST",
      body: JSON.stringify(req),
    }),
  generateAsset: (brief: string) =>
    json<GenerateAssetResponse>("/api/generate-asset", {
      method: "POST",
      body: JSON.stringify({ brief }),
    }),
};
