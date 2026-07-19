import type {
  BuildEvent,
  GameContext,
  GenerateAssetResponse,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
} from "@ai-gamedev/shared";
import { parseSseBuffer } from "./sse.js";

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

  /**
   * Sends a chat message and streams the autonomous pipeline's build events.
   * `onEvent` is called for each event as it arrives.
   */
  chat: async (
    message: string,
    onEvent: (event: BuildEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> => {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { data, rest } = parseSseBuffer(buffer);
      buffer = rest;
      for (const payload of data) onEvent(JSON.parse(payload) as BuildEvent);
    }
  },
};
