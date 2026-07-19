import type {
  BuildEvent,
  GameContext,
  GameSetupAnswers,
  GenerateAssetResponse,
  GenerateRequest,
  GenerateResponse,
  HealthResponse,
  ProjectMeta,
} from "@ai-gamedev/shared";
import { parseSseBuffer } from "./sse.js";

export interface ProjectDetail {
  meta: ProjectMeta;
  context: GameContext;
}

export type CreatedProject = ProjectMeta & { initialPrompt: string };

/**
 * Thin, typed client for the orchestration API. Prefer same-origin `/api/*`
 * paths (Vite proxies them in dev) so Cursor Cloud / remote previews work
 * without pointing the browser at localhost.
 */
const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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

  /** Absolute-or-relative URL for a packaged zip download. */
  artifactUrl: (downloadPath: string): string => `${BASE}${downloadPath}`,

  /** List saved game projects (Cursor-style sidebar). */
  listProjects: () => json<ProjectMeta[]>("/api/projects"),

  /** Load a project's metadata + persisted context (blueprint + chat). */
  getProject: (id: string) => json<ProjectDetail>(`/api/projects/${id}`),

  /** Create a project from setup wizard answers. */
  createProject: (answers: GameSetupAnswers) =>
    json<CreatedProject>("/api/projects", {
      method: "POST",
      body: JSON.stringify(answers),
    }),

  /**
   * Sends a chat message and streams the autonomous pipeline's build events.
   * `onEvent` is called for each event as it arrives. When `projectId` is set,
   * the message is scoped to that project's isolated context.
   */
  chat: async (
    message: string,
    onEvent: (event: BuildEvent) => void,
    signal?: AbortSignal,
    projectId?: string,
  ): Promise<void> => {
    const path = projectId ? `/api/projects/${projectId}/chat` : "/api/chat";
    const res = await fetch(`${BASE}${path}`, {
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
      for (const payload of data) {
        try {
          onEvent(JSON.parse(payload) as BuildEvent);
        } catch {
          // Skip malformed frames rather than aborting the whole stream.
        }
      }
    }
  },
};
