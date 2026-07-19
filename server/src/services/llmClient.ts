import type { GenerateTask, GenerationSource } from "@ai-gamedev/shared";
import type { ServerConfig } from "../config.js";
import { mockCompletion } from "./mockLlm.js";

export interface GenerateResult {
  text: string;
  source: GenerationSource;
}

export interface GenerateOptions {
  system?: string;
  /** Hint used only by the mock to produce a task-appropriate response. */
  task?: GenerateTask;
}

/**
 * Abstraction over a chat-completion backend. The concrete implementation talks
 * to an OpenAI-compatible endpoint (LM Studio / Ollama), but callers only ever
 * see this interface so the transport can be swapped or faked.
 */
export interface LLMClient {
  readonly model: string;
  readonly baseUrl: string;
  generate(prompt: string, options?: GenerateOptions): Promise<GenerateResult>;
  /** Cheap reachability probe for health checks. */
  ping(): Promise<boolean>;
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Client for an OpenAI-compatible local server such as LM Studio's
 * ("http://localhost:1234/v1"). When the endpoint is unreachable and mock
 * fallback is enabled, it returns a deterministic offline response so the whole
 * pipeline remains demonstrable without a running model.
 */
export class LMStudioClient implements LLMClient {
  readonly model: string;
  readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly allowMockFallback: boolean;
  private readonly timeoutMs: number;

  constructor(config: ServerConfig["llm"]) {
    this.model = config.model;
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.allowMockFallback = config.allowMockFallback;
    this.timeoutMs = config.timeoutMs;
  }

  async generate(
    prompt: string,
    options: GenerateOptions = {},
  ): Promise<GenerateResult> {
    try {
      const text = await this.callChatCompletions(prompt, options.system);
      return { text, source: "llm" };
    } catch (error) {
      if (!this.allowMockFallback) throw error;
      // Observability hook: make the fallback visible without crashing.
      console.warn(
        `[llm] falling back to mock (${(error as Error).message}). ` +
          `Start LM Studio at ${this.baseUrl} for real generations.`,
      );
      return { text: mockCompletion(prompt, options.task), source: "mock" };
    }
  }

  async ping(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2_000);
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timer);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async callChatCompletions(
    prompt: string,
    system?: string,
  ): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.7,
          stream: false,
          messages: [
            ...(system ? [{ role: "system", content: system }] : []),
            { role: "user", content: prompt },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`LLM responded ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const text = data.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("LLM returned an empty completion");
      return text;
    } finally {
      clearTimeout(timer);
    }
  }
}
