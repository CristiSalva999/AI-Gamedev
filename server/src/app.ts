import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  type BuildEvent,
  type ChatMessage,
  type ChatRequest,
  type GameBlueprint,
  type GameContext,
  type GenerateAssetRequest,
  type GenerateAssetResponse,
  type GenerateRequest,
  type GenerateResponse,
  type HealthResponse,
  type NPC,
} from "@ai-gamedev/shared";
import { runBuild, runSteer, type PipelineOptions } from "./pipeline/pipeline.js";
import { generatePrompt, SYSTEM_PROMPT } from "./prompts.js";
import type { AssetGenerator } from "./services/assetGenerator.js";
import type { ContextStore } from "./services/contextStore.js";
import type { GamePackager } from "./services/gamePackager.js";
import type { LLMClient } from "./services/llmClient.js";

export interface AppDependencies {
  contextStore: ContextStore;
  llm: LLMClient;
  assetGenerator: AssetGenerator;
  packager?: GamePackager;
  gamesDir?: string;
  /** Pipeline tuning (e.g. streaming delays); overridable in tests. */
  pipelineOptions?: PipelineOptions;
}

/**
 * Builds the Express app from injected collaborators. No module-level singletons
 * so tests can wire in fakes and run in isolation.
 */
export function createApp(deps: AppDependencies): Express {
  const {
    contextStore,
    llm,
    assetGenerator,
    packager,
    gamesDir,
    pipelineOptions,
  } = deps;
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      const [reachable, blenderOk] = await Promise.all([
        llm.ping(),
        assetGenerator.blenderAvailable(),
      ]);
      const body: HealthResponse = {
        status: "ok",
        llm: {
          configured: true,
          reachable,
          model: llm.model,
          baseUrl: llm.baseUrl,
        },
        blender: {
          available: blenderOk,
          mode: blenderOk ? "blender" : "procedural",
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
      const outputDir = gamesDir ? path.join(gamesDir, "_scratch", "assets") : undefined;
      const { asset, blenderScript, source } = await assetGenerator.generate(
        brief,
        context,
        { outputDir },
      );

      context.assets.models[asset.id] = asset;
      context.generatedScripts[`${asset.id}.py`] = blenderScript;
      context.completedTasks.push(`Generated asset: ${asset.name}`);
      await contextStore.save(context);

      const body: GenerateAssetResponse = { asset, blenderScript, source };
      res.status(201).json(body);
    }),
  );

  // Download a packaged game zip produced by the package stage.
  app.get(
    "/api/artifacts/:slug/download",
    asyncHandler(async (req, res) => {
      if (!gamesDir) {
        res.status(404).json({ error: "Artifacts not configured" });
        return;
      }
      const slug = String(req.params.slug).replace(/[^a-z0-9-_]/gi, "");
      if (!slug) {
        res.status(400).json({ error: "Invalid slug" });
        return;
      }
      const zipPath = path.join(gamesDir, `${slug}.zip`);
      try {
        await access(zipPath);
      } catch {
        res.status(404).json({ error: "Artifact not found" });
        return;
      }
      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${slug}.zip"`,
      );
      createReadStream(zipPath).pipe(res);
    }),
  );

  // Chat-driven autonomous pipeline. Streams Server-Sent Events so the client
  // can render progress and live "sneak peeks" of the game being built.
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { message } = (req.body ?? {}) as ChatRequest;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing 'message' in request body" });
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders?.();

    let aborted = false;
    // Detect real client disconnects on the response; the request stream can
    // emit "close" early (once its body is consumed), which would abort too soon.
    res.on("close", () => {
      aborted = true;
    });

    const send = (event: BuildEvent): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const context = await contextStore.load();
      context.chat.push(chatMessage("user", message));

      const build = !context.blueprint || isBuildRequest(message);
      const pipelineDeps = {
        llm,
        assetGenerator,
        packager,
        assetsDir: gamesDir,
      };
      const events = build
        ? runBuild(message, pipelineDeps, pipelineOptions)
        : runSteer(message, context.blueprint as GameBlueprint, pipelineDeps);

      let latest: GameBlueprint | undefined = context.blueprint;
      for await (const event of events) {
        if (aborted) break;
        if (event.type === "sneak-peek" || event.type === "done") {
          latest = event.blueprint;
        }
        if (event.type === "artifact") {
          context.lastManifest = event.manifest;
        }
        if (event.type === "message") {
          context.chat.push(chatMessage("assistant", event.content));
        }
        send(event);
      }

      if (!aborted) {
        context.blueprint = latest;
        // Bound the persisted transcript so the file stays small.
        context.chat = context.chat.slice(-50);
        await contextStore.save(context);
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : "Pipeline failed";
      console.error("[server] pipeline failed:", messageText);
      if (!aborted) send({ type: "error", message: messageText });
    } finally {
      res.end();
    }
  });

  app.use(errorHandler);
  return app;
}

/** Heuristic: does this message ask to start a brand-new game build? */
function isBuildRequest(message: string): boolean {
  const m = message.toLowerCase();
  const wantsNew = /\b(create|make|build|generate|start|new|prototype|design)\b/.test(m);
  const mentionsGame = /\bgame|level|world|rpg|shooter|platformer\b/.test(m);
  return wantsNew && mentionsGame;
}

function chatMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: randomUUID(), role, content, at: Date.now() };
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
