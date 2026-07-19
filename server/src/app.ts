import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  type GameContext,
  type GenerateAssetRequest,
  type GenerateAssetResponse,
  type GenerateRequest,
  type GenerateResponse,
  type HealthResponse,
  type NPC,
} from "@ai-gamedev/shared";
import { generatePrompt, SYSTEM_PROMPT } from "./prompts.js";
import type { AssetGenerator } from "./services/assetGenerator.js";
import type { ContextStore } from "./services/contextStore.js";
import type { LLMClient } from "./services/llmClient.js";

export interface AppDependencies {
  contextStore: ContextStore;
  llm: LLMClient;
  assetGenerator: AssetGenerator;
}

/**
 * Builds the Express app from injected collaborators. No module-level singletons
 * so tests can wire in fakes and run in isolation.
 */
export function createApp(deps: AppDependencies): Express {
  const { contextStore, llm, assetGenerator } = deps;
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      const reachable = await llm.ping();
      const body: HealthResponse = {
        status: "ok",
        llm: {
          configured: true,
          reachable,
          model: llm.model,
          baseUrl: llm.baseUrl,
        },
      };
      res.json(body);
    }),
  );

  app.get(
    "/api/context",
    asyncHandler(async (_req, res) => {
      res.json(await contextStore.load());
    }),
  );

  app.post(
    "/api/context",
    asyncHandler(async (req, res) => {
      const context = req.body as GameContext;
      if (!context || typeof context.gameTitle !== "string") {
        res.status(400).json({ error: "Invalid GameContext payload" });
        return;
      }
      res.json(await contextStore.save(context));
    }),
  );

  app.post(
    "/api/generate",
    asyncHandler(async (req, res) => {
      const payload = req.body as GenerateRequest;
      if (!payload || typeof payload.task !== "string") {
        res.status(400).json({ error: "Missing 'task' in request body" });
        return;
      }

      const context = await contextStore.load();
      const prompt = payload.prompt ?? buildPrompt(payload, context);
      if (!prompt) {
        res.status(400).json({ error: "Could not build a prompt from params" });
        return;
      }

      const result = await llm.generate(prompt, {
        system: SYSTEM_PROMPT(context),
        task: payload.task,
      });

      // Keep the shared conversation memory grounded for future generations.
      context.conversationMemory.push({
        role: "assistant",
        content: result.text,
        timestamp: Date.now(),
      });
      await contextStore.save(context);

      const body: GenerateResponse = {
        text: result.text,
        source: result.source,
        model: llm.model,
      };
      res.json(body);
    }),
  );

  app.post(
    "/api/generate-asset",
    asyncHandler(async (req, res) => {
      const { brief } = req.body as GenerateAssetRequest;
      if (!brief || typeof brief !== "string") {
        res.status(400).json({ error: "Missing 'brief' in request body" });
        return;
      }

      const context = await contextStore.load();
      const { asset, blenderScript, source } = await assetGenerator.generate(
        brief,
        context,
      );

      context.assets.models[asset.id] = asset;
      context.generatedScripts[`${asset.id}.py`] = blenderScript;
      context.completedTasks.push(`Generated asset: ${asset.name}`);
      await contextStore.save(context);

      const body: GenerateAssetResponse = { asset, blenderScript, source };
      res.status(201).json(body);
    }),
  );

  app.use(errorHandler);
  return app;
}

function buildPrompt(payload: GenerateRequest, context: GameContext): string | null {
  const params = payload.params ?? {};
  switch (payload.task) {
    case "npcDialogue": {
      const npc = resolveNpc(params.npc, context);
      const playerAction = String(params.playerAction ?? "looks around");
      return npc ? generatePrompt.npcDialogue(npc, context, playerAction) : null;
    }
    case "modelGeneration":
      return generatePrompt.modelGeneration(String(params.brief ?? ""), context);
    case "worldBuilding":
      return generatePrompt.worldBuilding(String(params.location ?? ""), context);
    case "codeGeneration":
      return generatePrompt.codeGeneration(String(params.task ?? ""), context);
    case "freeform":
      return typeof params.text === "string" ? params.text : null;
    default: {
      // Exhaustiveness guard for GenerateTask.
      const _never: never = payload.task;
      return _never;
    }
  }
}

function resolveNpc(raw: unknown, context: GameContext): NPC | null {
  if (raw && typeof raw === "object" && "name" in raw) return raw as NPC;
  if (typeof raw === "string" && context.assets.characters[raw]) {
    return context.assets.characters[raw];
  }
  const first = Object.values(context.assets.characters)[0];
  return first ?? null;
}

/** Wraps async handlers so rejected promises reach the error middleware. */
function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error("[server] request failed:", message);
  res.status(500).json({ error: message });
}
