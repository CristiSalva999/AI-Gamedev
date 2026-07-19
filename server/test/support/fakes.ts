import {
  createDefaultContext,
  createSampleNpc,
  type GameContext,
} from "@ai-gamedev/shared";
import type { ContextStore } from "../../src/services/contextStore.js";
import type {
  GenerateOptions,
  GenerateResult,
  LLMClient,
} from "../../src/services/llmClient.js";
import { mockCompletion } from "../../src/services/mockLlm.js";

/** In-memory {@link ContextStore} for isolated route tests. */
export class InMemoryContextStore implements ContextStore {
  private context: GameContext;

  constructor(initial?: GameContext) {
    const npc = createSampleNpc();
    this.context =
      initial ??
      createDefaultContext({
        assets: { models: {}, materials: {}, characters: { [npc.id]: npc } },
      });
  }

  async load(): Promise<GameContext> {
    // Return a copy so handlers cannot mutate internal state by reference.
    return structuredClone(this.context);
  }

  async save(context: GameContext): Promise<GameContext> {
    this.context = structuredClone(context);
    return this.context;
  }
}

/** Deterministic {@link LLMClient} fake that records the prompts it receives. */
export class FakeLLMClient implements LLMClient {
  readonly model = "fake-model";
  readonly baseUrl = "http://fake.local/v1";
  readonly calls: Array<{ prompt: string; options?: GenerateOptions }> = [];

  constructor(
    private readonly response: GenerateResult = { text: "hello", source: "mock" },
    private readonly reachable = false,
  ) {}

  async generate(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<GenerateResult> {
    this.calls.push({ prompt, options });
    return this.response;
  }

  async ping(): Promise<boolean> {
    return this.reachable;
  }
}

/**
 * LLM fake backed by the real offline mock, so pipeline tests exercise the same
 * task-aware output (e.g. valid world-building JSON) without any network.
 */
export class LocalMockLLMClient implements LLMClient {
  readonly model = "mock-model";
  readonly baseUrl = "http://mock.local/v1";

  async generate(
    prompt: string,
    options?: GenerateOptions,
  ): Promise<GenerateResult> {
    return { text: mockCompletion(prompt, options?.task), source: "mock" };
  }

  async ping(): Promise<boolean> {
    return false;
  }
}
