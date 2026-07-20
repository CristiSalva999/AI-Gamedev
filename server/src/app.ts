import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  composeSetupPrompt,
  GENRE_KINDS,
  type BuildEvent,
  type ChatMessage,
  type ChatRequest,
  type GameBlueprint,
  type GameContext,
  type GameSetupAnswers,
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
import type { ProjectStore } from "./services/projectStore.js";

export interface AppDependencies {
  contextStore: ContextStore;
  llm: LLMClient;
  assetGenerator: AssetGenerator;
  packager?: GamePackager;
  gamesDir?: string;
  /** Optional multi-project registry enabling the Cursor-style projects UI. */
  projectStore?: ProjectStore;
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
    projectStore,
    pipelineOptions,
  } = deps;
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get(
    "/api/health",
    asyncHandler(async (_req, res) => {
      const [reachable, blenderProbe] = await Promise.all([
        llm.ping(),
        assetGenerator.probeBlender
          ? assetGenerator.probeBlender()
          : assetGenerator.blenderAvailable().then((available) => ({
              available,
              tried: [] as string[],
              path: undefined as string | undefined,
              hint: undefined as string | undefined,
            })),
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
          available: blenderProbe.available,
          mode: blenderProbe.available ? "blender" : "procedural",
          ...(blenderProbe.path ? { path: blenderProbe.path } : {}),
          ...(blenderProbe.available || !blenderProbe.hint
            ? {}
            : { hint: blenderProbe.hint }),
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

  const streamDeps = { llm, assetGenerator, packager, gamesDir, pipelineOptions };

  // Chat-driven autonomous pipeline. Streams Server-Sent Events so the client
  // can render progress and live "sneak peeks" of the game being built.
  app.post("/api/chat", async (req: Request, res: Response) => {
    const { message } = (req.body ?? {}) as ChatRequest;
    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing 'message' in request body" });
      return;
    }
    const context = await contextStore.load();
    await streamChat(streamDeps, message, context, res, async (updated) => {
      await contextStore.save(updated);
    });
  });

  // ----- Projects (Cursor-style grouping) ----------------------------------
  if (projectStore) {
    app.get(
      "/api/projects",
      asyncHandler(async (_req, res) => {
        res.json(await projectStore.list());
      }),
    );

    app.post(
      "/api/projects",
      asyncHandler(async (req, res) => {
        const answers = req.body as Partial<GameSetupAnswers>;
        if (!answers || typeof answers.title !== "string" || !answers.title.trim()) {
          res.status(400).json({ error: "A project title is required" });
          return;
        }
        const record = await projectStore.create(answers as GameSetupAnswers);
        res.status(201).json({
          ...record.meta,
          initialPrompt: composeSetupPrompt(answers as GameSetupAnswers),
        });
      }),
    );

    app.get(
      "/api/projects/:id",
      asyncHandler(async (req, res) => {
        const id = String(req.params.id);
        const record = await projectStore.get(id);
        if (!record) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json({ meta: record.meta, context: record.context });
      }),
    );

    app.patch(
      "/api/projects/:id",
      asyncHandler(async (req, res) => {
        const id = String(req.params.id);
        const patch = (req.body ?? {}) as Partial<GameSetupAnswers>;
        if (
          patch.genre !== undefined &&
          !(GENRE_KINDS as readonly string[]).includes(String(patch.genre))
        ) {
          res.status(400).json({ error: "invalid genre" });
          return;
        }
        if (patch.title !== undefined && !String(patch.title).trim()) {
          res.status(400).json({ error: "title cannot be empty" });
          return;
        }
        const meta = await projectStore.update(id, patch);
        if (!meta) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.json(meta);
      }),
    );

    app.delete(
      "/api/projects/:id",
      asyncHandler(async (req, res) => {
        const removed = await projectStore.remove(String(req.params.id));
        if (!removed) {
          res.status(404).json({ error: "Project not found" });
          return;
        }
        res.status(204).end();
      }),
    );

    app.post("/api/projects/:id/chat", async (req: Request, res: Response) => {
      const id = String(req.params.id);
      const { message } = (req.body ?? {}) as ChatRequest;
      if (!message || typeof message !== "string") {
        res.status(400).json({ error: "Missing 'message' in request body" });
        return;
      }
      const record = await projectStore.get(id);
      if (!record) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      await streamChat(streamDeps, message, record.context, res, async (updated) => {
        await projectStore.saveContext(id, updated);
      });
    });
  }

  app.use(errorHandler);
  return app;
}

interface StreamDeps {
  llm: LLMClient;
  assetGenerator: AssetGenerator;
  packager?: GamePackager;
  gamesDir?: string;
  pipelineOptions?: PipelineOptions;
}

/**
 * Runs the build/steer pipeline for one message against a given context and
 * streams events over SSE. The `persist` callback stores the mutated context —
 * either the global context store or a per-project store — so this single
 * implementation backs both `/api/chat` and `/api/projects/:id/chat`.
 */
async function streamChat(
  deps: StreamDeps,
  message: string,
  context: GameContext,
  res: Response,
  persist: (context: GameContext) => Promise<void>,
): Promise<void> {
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
    context.chat.push(chatMessage("user", message));

    const build = !context.blueprint || isBuildRequest(message);
    const pipelineDeps = {
      llm: deps.llm,
      assetGenerator: deps.assetGenerator,
      packager: deps.packager,
      assetsDir: deps.gamesDir,
    };
    const events = build
      ? runBuild(message, pipelineDeps, deps.pipelineOptions)
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
      await persist(context);
    }
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Pipeline failed";
    console.error("[server] pipeline failed:", messageText);
    if (!aborted) send({ type: "error", message: messageText });
  } finally {
    res.end();
  }
}

/** Heuristic: does this message ask to start a brand-new game build? */
function isBuildRequest(message: string): boolean {
  const m = message.toLowerCase();
  const wantsNew = /\b(create|make|build|generate|start|new|prototype|design|genera)\b/.test(m);
  const mentionsGame =
    /\bgame|level|world|rpg|shooter|platformer|racing|arcade|gioco|macchin|circuit|dungeon|forest\b/.test(
      m,
    );
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
    case "gameDesign":
      return generatePrompt.gameDesign(
        String(params.prompt ?? ""),
        String(params.title ?? context.gameTitle),
        (params.genre as "exploration") ?? "exploration",
        (params.fidelity as "cinematic") ?? "cinematic",
      );
    case "worldRecipe":
      return generatePrompt.worldRecipe(
        String(params.title ?? context.gameTitle),
        (params.genre as "exploration") ?? "exploration",
        (params.fidelity as "cinematic") ?? "cinematic",
      );
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
