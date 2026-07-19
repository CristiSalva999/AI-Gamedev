import {
  createDefaultContext,
  type BlueprintEntity,
  type BuildEvent,
  type BuildStage,
  type GameBlueprint,
  type GameContext,
  type LightingMood,
} from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import type { AssetGenerator } from "../services/assetGenerator.js";
import type { GamePackager } from "../services/gamePackager.js";
import type { LLMClient } from "../services/llmClient.js";
import {
  animationFor,
  behaviorFor,
  deriveTheme,
  deriveTitle,
  moodLabel,
  playerFor,
  ringPosition,
  slugify,
  type Theme,
} from "./heuristics.js";

export interface PipelineDeps {
  llm: LLMClient;
  assetGenerator: AssetGenerator;
  /** When omitted, the package stage records a dry-run manifest (tests). */
  packager?: GamePackager;
  /** Directory where per-game GLB assets are written during a build. */
  assetsDir?: string;
}

export interface PipelineOptions {
  /** Artificial delay between package steps for a nicer stream (0 in tests). */
  delayMs?: number;
  /** Cap on generated entities to keep scenes readable. */
  maxAssets?: number;
}

const MAX_ASSETS_DEFAULT = 6;

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();

function nowContext(theme: Theme, title: string): GameContext {
  return createDefaultContext({
    gameTitle: title,
    gameGenre: theme.genre,
    visualStyle: theme.visualStyle,
    colorPalette: theme.palette,
  });
}

function contextFromBlueprint(blueprint: GameBlueprint): GameContext {
  return createDefaultContext({
    gameTitle: blueprint.gameTitle,
    gameGenre: blueprint.gameGenre,
    visualStyle: blueprint.visualStyle,
    colorPalette: blueprint.colorPalette,
  });
}

/**
 * Runs the full autonomous "create a game" pipeline for a prompt, yielding
 * streamable events (progress + live blueprint sneak peeks). No user
 * interaction is required between stages.
 */
export async function* runBuild(
  prompt: string,
  deps: PipelineDeps,
  options: PipelineOptions = {},
): AsyncGenerator<BuildEvent> {
  const delayMs = options.delayMs ?? 0;
  const maxAssets = options.maxAssets ?? MAX_ASSETS_DEFAULT;

  const theme = deriveTheme(prompt);
  const title = deriveTitle(prompt);
  const slug = slugify(title);
  const context = nowContext(theme, title);
  const timestamp = Date.now();

  const blueprint: GameBlueprint = {
    gameTitle: title,
    gameGenre: theme.genre,
    visualStyle: theme.visualStyle,
    colorPalette: theme.palette,
    pitch: "",
    environment: { ...theme.environment },
    entities: [],
    player: playerFor(theme),
    mechanics: ["move", "explore", "interact"],
    scripts: {},
    animations: {},
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  yield {
    type: "message",
    role: "assistant",
    content: `On it — building "${title}", a ${theme.genre.toLowerCase()} in a ${moodLabel(theme.environment.lighting)} setting. I'll stream sneak peeks as I go.`,
  };

  // --- Stage: design -------------------------------------------------------
  yield { type: "stage-start", stage: "design", label: "Designing concept" };
  const pitch = await buildPitch(prompt, blueprint, deps.llm);
  blueprint.pitch = pitch;
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "design",
    note: `Concept: ${pitch}`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "design" };

  // --- Stage: world --------------------------------------------------------
  yield { type: "stage-start", stage: "world", label: "Designing the level" };
  const world = await planWorld(title, context, deps.llm, theme);
  blueprint.environment.atmosphere = world.atmosphere ?? blueprint.environment.atmosphere;
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "world",
    note: `Level plan: ${world.assets.length} set pieces — ${world.assets.join(", ")}.`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "world" };

  // --- Stage: assets (streamed one by one = sneak peeks) -------------------
  yield { type: "stage-start", stage: "assets", label: "Generating assets & textures" };
  const assetOutputDir = deps.assetsDir
    ? `${deps.assetsDir}/${slug}/assets`
    : undefined;
  const briefs = world.assets.slice(0, maxAssets);
  for (let i = 0; i < briefs.length; i++) {
    const brief = briefs[i];
    const { asset } = await deps.assetGenerator.generate(brief, context, {
      outputDir: assetOutputDir,
    });
    const interactive = world.interactive.has(brief.toLowerCase()) || i < 2;
    const behavior = behaviorFor(interactive, i);
    const entity: BlueprintEntity = {
      id: asset.id,
      name: asset.name,
      spec: asset.spec,
      position: ringPosition(i, briefs.length),
      behavior,
      interactive,
    };
    blueprint.entities.push(entity);
    blueprint.updatedAt = Date.now();
    yield {
      type: "sneak-peek",
      stage: "assets",
      note: `Modeled "${asset.name}" → ${asset.spec.shape} (${asset.spec.color})${asset.source ? " · .glb" : ""}${interactive ? " · interactive" : ""}.`,
      blueprint: clone(blueprint),
    };
    await sleep(delayMs);
  }
  yield { type: "stage-complete", stage: "assets" };

  // --- Stage: scripts ------------------------------------------------------
  yield { type: "stage-start", stage: "scripts", label: "Writing gameplay logic" };
  const { text: script } = await deps.llm.generate(
    generatePrompt.codeGeneration("player movement and interaction", context),
    { task: "codeGeneration" },
  );
  blueprint.scripts["gameplay.ts"] = script;
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "scripts",
    note: `Wrote gameplay.ts (${script.split("\n").length} lines).`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "scripts" };

  // --- Stage: animations ---------------------------------------------------
  yield { type: "stage-start", stage: "animations", label: "Authoring animations" };
  for (const entity of blueprint.entities) {
    const clip = animationFor(entity.behavior, entity.id);
    if (clip) {
      entity.animation = clip;
      blueprint.animations[clip.id] = clip;
    }
  }
  blueprint.animations[blueprint.player.animations.idle.id] = blueprint.player.animations.idle;
  blueprint.animations[blueprint.player.animations.walk.id] = blueprint.player.animations.walk;
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "animations",
    note: `Authored ${Object.keys(blueprint.animations).length} animation clips (idle/walk + prop loops).`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "animations" };

  // --- Stage: player -------------------------------------------------------
  yield { type: "stage-start", stage: "player", label: "Configuring player" };
  yield {
    type: "sneak-peek",
    stage: "player",
    note: `Player ready (WASD, speed ${blueprint.player.speed}, idle+walk clips).`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "player" };

  // --- Stage: assemble -----------------------------------------------------
  yield { type: "stage-start", stage: "assemble", label: "Assembling scene" };
  blueprint.updatedAt = Date.now();
  yield { type: "stage-complete", stage: "assemble" };

  // --- Stage: package (real git workspace + zip) ---------------------------
  yield { type: "stage-start", stage: "package", label: "Building & packaging" };
  for (const step of [
    `Creating git workspace game/${slug}`,
    "Writing .glb assets & scripts",
    "Baking playable HTML runner",
    "Packaging downloadable .zip",
  ]) {
    yield { type: "message", role: "assistant", content: step };
    await sleep(delayMs);
  }

  let manifest;
  if (deps.packager) {
    const result = await deps.packager.package(blueprint, { slug });
    manifest = result.manifest;
    yield {
      type: "message",
      role: "assistant",
      content: manifest.branchCreated
        ? `Git branch ${manifest.branch} created at ${manifest.installPath}`
        : `Workspace ready at ${manifest.installPath} (git unavailable — files written anyway)`,
    };
  } else {
    // Dry-run path used by unit tests that don't want filesystem side effects.
    manifest = {
      name: title,
      slug,
      branch: `game/${slug}`,
      branchCreated: false,
      entityCount: blueprint.entities.length,
      assetCount: blueprint.entities.length,
      scriptCount: Object.keys(blueprint.scripts).length,
      animationCount: Object.keys(blueprint.animations).length,
      approxSizeKb: estimateSizeKb(blueprint),
      downloadUrl: `/api/artifacts/${slug}/download`,
      installPath: `(dry-run)/${slug}`,
      packageFormat: "zip+html" as const,
    };
  }

  yield { type: "artifact", manifest };
  yield { type: "stage-complete", stage: "package" };

  yield {
    type: "message",
    role: "assistant",
    content: `"${title}" is ready. Download the zip and open play.html, or keep steering — e.g. "make it night", "add more crates", "player faster".`,
  };
  yield { type: "done", blueprint: clone(blueprint) };
}

/**
 * Applies a live steering instruction to an already-built game and streams the
 * resulting changes. Deterministic keyword handling keeps it responsive offline.
 */
export async function* runSteer(
  message: string,
  current: GameBlueprint,
  deps: PipelineDeps,
): AsyncGenerator<BuildEvent> {
  const blueprint = clone(current);
  const lower = message.toLowerCase();

  const lighting = matchLighting(lower);
  if (lighting) {
    blueprint.environment.lighting = lighting;
    applyLightingColors(blueprint, lighting);
    return yield* commit(
      blueprint,
      "assemble",
      `Relit the scene to ${moodLabel(lighting)}.`,
    );
  }

  const speed = matchSpeed(lower);
  if (speed) {
    blueprint.player.speed = clampSpeed(blueprint.player.speed + speed.delta);
    return yield* commit(
      blueprint,
      "player",
      `Player speed is now ${blueprint.player.speed}.`,
    );
  }

  const addBrief = matchAddBrief(lower);
  if (addBrief) {
    yield { type: "stage-start", stage: "assets", label: `Adding "${addBrief}"` };
    const context = contextFromBlueprint(blueprint);
    const count = /\bmore\b|\bfew\b|\bsome\b/.test(lower) ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const { asset } = await deps.assetGenerator.generate(addBrief, context);
      const index = blueprint.entities.length;
      const behavior = behaviorFor(false, index);
      const clip = animationFor(behavior, asset.id);
      if (clip) blueprint.animations[clip.id] = clip;
      blueprint.entities.push({
        id: asset.id,
        name: asset.name,
        spec: asset.spec,
        position: ringPosition(index, index + 1),
        behavior,
        animation: clip,
        interactive: false,
      });
    }
    blueprint.updatedAt = Date.now();
    yield {
      type: "sneak-peek",
      stage: "assets",
      note: `Added ${count} × "${addBrief}". Scene now has ${blueprint.entities.length} objects.`,
      blueprint: clone(blueprint),
    };
    yield { type: "stage-complete", stage: "assets" };
    yield { type: "done", blueprint: clone(blueprint) };
    return;
  }

  if (/\bclear|remove all|empty\b/.test(lower)) {
    blueprint.entities = [];
    return yield* commit(blueprint, "assemble", "Cleared the scene.");
  }

  // Fallback: acknowledge conversationally without structural changes.
  const { text } = await deps.llm.generate(message, { task: "freeform" });
  yield {
    type: "message",
    role: "assistant",
    content: text.startsWith("【mock】")
      ? `Noted. Try "make it night", "add a tower", or "player faster" to change the build.`
      : text,
  };
  yield { type: "done", blueprint: clone(blueprint) };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function* commit(
  blueprint: GameBlueprint,
  stage: BuildStage,
  note: string,
): AsyncGenerator<BuildEvent> {
  blueprint.updatedAt = Date.now();
  yield { type: "sneak-peek", stage, note, blueprint: clone(blueprint) };
  yield { type: "done", blueprint: clone(blueprint) };
}

async function buildPitch(
  prompt: string,
  blueprint: GameBlueprint,
  llm: LLMClient,
): Promise<string> {
  const template = `${blueprint.gameTitle} is a ${blueprint.visualStyle} ${blueprint.gameGenre.toLowerCase()} where you explore and interact with a hand-built world inspired by: ${prompt.trim()}.`;
  const { text, source } = await llm.generate(
    `Write a punchy 1-2 sentence pitch for a ${blueprint.gameGenre} titled "${blueprint.gameTitle}" about: ${prompt}`,
    { task: "freeform" },
  );
  // Use the model's copy only when it is a real generation; the mock is generic.
  return source === "llm" && text.length > 0 ? text : template;
}

interface WorldPlan {
  assets: string[];
  interactive: Set<string>;
  atmosphere?: string;
}

async function planWorld(
  title: string,
  context: GameContext,
  llm: LLMClient,
  theme: Theme,
): Promise<WorldPlan> {
  const { text } = await llm.generate(
    generatePrompt.worldBuilding(title, context),
    { task: "worldBuilding" },
  );
  const parsed = safeParseWorld(text);
  const assets = parsed.assets.length > 0 ? parsed.assets : theme.defaultAssets;
  return { assets, interactive: parsed.interactive, atmosphere: parsed.atmosphere };
}

function safeParseWorld(text: string): WorldPlan {
  const empty: WorldPlan = { assets: [], interactive: new Set() };
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return empty;
    const json = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const assets = Array.isArray(json.keyAssets)
      ? json.keyAssets.filter((a): a is string => typeof a === "string")
      : [];
    const interactive = new Set(
      (Array.isArray(json.interactive) ? json.interactive : [])
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.toLowerCase()),
    );
    const env = json.environment as Record<string, unknown> | undefined;
    const atmosphere = typeof env?.atmosphere === "string" ? env.atmosphere : undefined;
    return { assets, interactive, atmosphere };
  } catch {
    return empty;
  }
}

const LIGHTING_WORDS: Array<[LightingMood, RegExp]> = [
  ["night", /\b(night|dark|darker|midnight|moonlit)\b/],
  ["day", /\b(day|bright|brighter|daylight|sunny|light)\b/],
  ["dusk", /\b(dusk|sunset|evening|golden hour)\b/],
  ["cave", /\b(cave|cavern|underground|gloom)\b/],
];

function matchLighting(text: string): LightingMood | null {
  for (const [mood, re] of LIGHTING_WORDS) if (re.test(text)) return mood;
  return null;
}

function applyLightingColors(blueprint: GameBlueprint, mood: LightingMood): void {
  switch (mood) {
    case "day":
      blueprint.environment.skyColor = "#7ec8e3";
      blueprint.environment.fog = false;
      break;
    case "dusk":
      blueprint.environment.skyColor = "#f5a05a";
      blueprint.environment.fog = false;
      break;
    case "night":
      blueprint.environment.skyColor = "#05060d";
      blueprint.environment.fog = true;
      break;
    case "cave":
      blueprint.environment.skyColor = "#0a0a0e";
      blueprint.environment.fog = true;
      break;
    default: {
      // Exhaustiveness guard for LightingMood.
      const _never: never = mood;
      return _never;
    }
  }
}

function matchSpeed(text: string): { delta: number } | null {
  if (/\b(faster|quicker|speed up|zoom)\b/.test(text)) return { delta: 3 };
  if (/\b(slower|slow down)\b/.test(text)) return { delta: -3 };
  return null;
}

function clampSpeed(value: number): number {
  return Math.max(2, Math.min(20, value));
}

function matchAddBrief(text: string): string | null {
  const match = text.match(/\b(?:add|include|place|spawn|more|another)\s+(?:a|an|some|more|few)?\s*([a-z][a-z\s]{1,30})/);
  if (!match) return null;
  const brief = match[1]
    .replace(/\b(please|to|the|scene|game|in|it|now)\b/g, "")
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(" ");
  return brief.length > 1 ? brief : null;
}

function estimateSizeKb(blueprint: GameBlueprint): number {
  const base = 420;
  const perEntity = 35;
  const scripts = Object.values(blueprint.scripts).join("").length / 1024;
  return Math.round(base + blueprint.entities.length * perEntity + scripts);
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
