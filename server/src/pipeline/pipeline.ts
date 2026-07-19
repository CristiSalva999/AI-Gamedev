import {
  controlProfileFor,
  createDefaultContext,
  summarizePlan,
  type BlueprintEntity,
  type BuildEvent,
  type BuildStage,
  type FidelityLevel,
  type GameBlueprint,
  type GameContext,
  type GameDesignDoc,
  type LightingMood,
  type WorldRecipe,
} from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import type { AssetGenerator } from "../services/assetGenerator.js";
import type { GamePackager } from "../services/gamePackager.js";
import type { LLMClient } from "../services/llmClient.js";
import { packForKind, pickGenrePack } from "./genrePacks.js";
import {
  animationFor,
  behaviorFor,
  deriveTitle,
  moodLabel,
  planLevelPlacements,
  playerFor,
  ringPosition,
  slugify,
  type Theme,
} from "./heuristics.js";
import { planRequest } from "./planner.js";
import { buildScaffold } from "./scaffold.js";
import { authorGameplayScript } from "./scriptAuthor.js";

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
  /** Cap on landmark entities streamed during the assets stage. */
  maxAssets?: number;
  /** Cap on ambient filler props (trees, bushes, rubble…). */
  maxAmbient?: number;
  /** Visual richness target — cinematic by default for real builds. */
  fidelity?: FidelityLevel;
}

const MAX_LANDMARKS_DEFAULT = 10;
const MAX_AMBIENT_DEFAULT = 36;
const DEFAULT_FIDELITY: FidelityLevel = "cinematic";

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
  const maxLandmarks = options.maxAssets ?? MAX_LANDMARKS_DEFAULT;
  const maxAmbient = options.maxAmbient ?? MAX_AMBIENT_DEFAULT;
  const fidelity = options.fidelity ?? DEFAULT_FIDELITY;

  // --- Stage: plan (understand & decompose the request) --------------------
  // A single "layer of thought" that clarifies the request, breaks it into
  // sub-requests → tasks → subtasks, and merges it back into a focused plan
  // (LLM when available, deterministic heuristic offline). Everything below is
  // driven by this plan, so the built game matches what was actually asked.
  yield { type: "stage-start", stage: "plan", label: "Clarifying & planning the request" };
  const plan = await planRequest(prompt, deps.llm);
  yield { type: "message", role: "assistant", content: summarizePlan(plan) };
  yield { type: "stage-complete", stage: "plan" };

  const pack = packForKind(plan.genre);
  const theme = structuredClone(pack.theme);
  const title = plan.title || deriveTitle(prompt);
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
    mechanics: [...pack.mechanics],
    scripts: { "plan.json": JSON.stringify(plan, null, 2) },
    animations: {},
    plan,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  yield {
    type: "message",
    role: "assistant",
    content: `On it — building "${title}" as a ${fidelity} ${pack.kind} experience (${theme.genre.toLowerCase()}, ${moodLabel(theme.environment.lighting)}). The local model will author design + world recipes; I'll stream sneak peeks.`,
  };

  // --- Stage: design -------------------------------------------------------
  yield { type: "stage-start", stage: "design", label: "Authoring game design doc" };
  const design = await authorDesignDoc(prompt, title, pack, fidelity, deps.llm);
  blueprint.design = design;
  blueprint.pitch = design.pitch;
  blueprint.visualStyle = design.visualStyle;
  blueprint.colorPalette = design.palette;
  blueprint.gameGenre = theme.genre;
  blueprint.controls = controlProfileFor(design.systems.controlScheme);
  if (design.systems.controlHints?.length) {
    blueprint.controls = {
      ...blueprint.controls,
      hudLine: design.systems.controlHints.join(" · "),
    };
  }
  context.visualStyle = design.visualStyle;
  context.colorPalette = design.palette;
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "design",
    note: `Design: ${design.genre}/${design.systems.controlScheme} · controls: ${blueprint.controls.hudLine} · fidelity ${design.fidelity}. ${design.pitch}`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "design" };

  // --- Stage: world --------------------------------------------------------
  yield { type: "stage-start", stage: "world", label: "Authoring world recipe" };
  const recipe = await authorWorldRecipe(title, pack, fidelity, deps.llm);
  blueprint.worldRecipe = recipe;
  blueprint.environment = {
    lighting: recipe.lighting,
    atmosphere: recipe.atmosphere,
    fog: recipe.postFx.fogDensity > 0,
    groundColor: recipe.groundColor,
    skyColor: recipe.skyColor,
    worldRadius: recipe.worldRadius,
    accentGroundColor: recipe.accentGroundColor,
    terrain: recipe.terrain,
    postFx: recipe.postFx,
  };
  const landmarkAssets = [
    ...recipe.zones.flatMap((z) => z.landmarks),
    ...theme.defaultAssets,
  ].filter((v, i, arr) => arr.indexOf(v) === i);
  const interactive = new Set(recipe.interactive.map((s) => s.toLowerCase()));
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "world",
    note: `World recipe: ${recipe.zones.length} zones, terrain=${recipe.terrain.kind}, radius=${recipe.worldRadius}, landmarks=${landmarkAssets.slice(0, 6).join(", ")}…`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "world" };

  // --- Stage: assets (streamed one by one = sneak peeks) -------------------
  yield { type: "stage-start", stage: "assets", label: "Sculpting cinematic assets" };
  const assetOutputDir = deps.assetsDir
    ? `${deps.assetsDir}/${slug}/assets`
    : undefined;
  const placements = planLevelPlacements(theme, landmarkAssets, interactive, {
    maxLandmarks,
    maxAmbient,
    recipe,
  });

  for (let i = 0; i < placements.length; i++) {
    const planned = placements[i];
    const { asset } = await deps.assetGenerator.generate(planned.brief, context, {
      outputDir: assetOutputDir,
      fidelity,
    });
    const behavior = behaviorFor(planned.role, planned.interactive, i, planned.brief);
    const entity: BlueprintEntity = {
      id: asset.id,
      name: asset.name,
      spec: asset.spec,
      position: planned.position,
      rotationY: planned.rotationY,
      behavior,
      interactive: planned.interactive,
      role: planned.role,
      interactHint: planned.interactHint,
    };
    blueprint.entities.push(entity);
    blueprint.updatedAt = Date.now();

    // Stream sneak peeks for landmarks; batch ambient fillers so the chat stays readable.
    const isLandmark = planned.role === "landmark" || planned.role === "loot";
    if (isLandmark || i === placements.length - 1) {
      const prefabLabel = asset.spec.prefab && asset.spec.prefab !== "primitive"
        ? asset.spec.prefab.replace(/_/g, " ")
        : asset.spec.shape;
      const partCount = asset.spec.parts?.length ?? 1;
      yield {
        type: "sneak-peek",
        stage: "assets",
        note: isLandmark
          ? `Sculpted "${asset.name}" → ${prefabLabel} (${partCount} parts, ${fidelity})${planned.interactive ? " · interactive" : ""}.`
          : `Populated the world with ${blueprint.entities.length} detailed set pieces.`,
        blueprint: clone(blueprint),
      };
      await sleep(delayMs);
    }
  }
  yield { type: "stage-complete", stage: "assets" };

  // --- Prefill complete game logic (before scripts so both share one scaffold)
  const scaffold = buildScaffold(prompt, pack, design);
  blueprint.runtime = scaffold.runtime;

  // --- Stage: scripts ------------------------------------------------------
  yield { type: "stage-start", stage: "scripts", label: "Authoring complete gameplay systems" };
  const scriptTask =
    design.systems.controlScheme === "drive"
      ? "arcade car driving with acceleration, steering, handbrake, boost, and checkpoint laps"
      : design.systems.controlScheme === "fps"
        ? "fps movement, fire, reload, sprint, and objective tracking"
        : "player movement, sprint, jump, proximity interaction, and objective tracking";
  const { text: llmSnippet, source: scriptSource } = await deps.llm.generate(
    generatePrompt.codeGeneration(scriptTask, context),
    { task: "codeGeneration" },
  );
  const script = authorGameplayScript({
    design,
    runtime: scaffold.runtime,
    controls: blueprint.controls ?? controlProfileFor(design.systems.controlScheme),
    llmSnippet: scriptSource === "llm" ? llmSnippet : undefined,
  });
  blueprint.scripts["gameplay.ts"] = script;
  blueprint.scripts["design.json"] = JSON.stringify(design, null, 2);
  blueprint.scripts["world.json"] = JSON.stringify(recipe, null, 2);
  blueprint.scripts["runtime.json"] = JSON.stringify(scaffold.runtime, null, 2);
  blueprint.updatedAt = Date.now();
  yield {
    type: "sneak-peek",
    stage: "scripts",
    note: `Prefill scaffold ready — ${scaffold.summary}. Wrote gameplay.ts (${script.split("\n").length} lines) with full rules/objectives/controls.`,
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
    note: `Player ready — ${blueprint.controls?.label ?? "controls"} · speed ${blueprint.player.speed} · HP ${scaffold.runtime.player.health} · ${blueprint.controls?.hudLine ?? ""}`,
    blueprint: clone(blueprint),
  };
  yield { type: "stage-complete", stage: "player" };

  // --- Stage: assemble -----------------------------------------------------
  yield { type: "stage-start", stage: "assemble", label: "Assembling scene" };
  blueprint.updatedAt = Date.now();
  const interactiveCount = blueprint.entities.filter((e) => e.interactive).length;
  const controls = blueprint.controls;
  yield {
    type: "sneak-peek",
    stage: "assemble",
    note: `Assembled ${blueprint.entities.length} props (${interactiveCount} interactive). Controls [${controls?.scheme ?? "walk"}]: ${controls?.hudLine ?? "WASD"}.`,
    blueprint: clone(blueprint),
  };
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
      const role = /\b(tree|bush|rock|boulder)\b/.test(addBrief) ? "ambient" as const : "landmark" as const;
      const behavior = behaviorFor(role, false, index, addBrief);
      const clip = animationFor(behavior, asset.id);
      if (clip) blueprint.animations[clip.id] = clip;
      const pos = ringPosition(index, index + 1);
      const radius = blueprint.environment.worldRadius ?? 14;
      blueprint.entities.push({
        id: asset.id,
        name: asset.name,
        spec: asset.spec,
        position: {
          x: Number((pos.x * (radius / 8)).toFixed(2)),
          y: 0,
          z: Number((pos.z * (radius / 8)).toFixed(2)),
        },
        behavior,
        animation: clip,
        interactive: false,
        role,
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

  const story = matchStoryEdit(message);
  if (story) {
    blueprint.pitch = story;
    if (blueprint.design) {
      blueprint.design = { ...blueprint.design, pitch: story };
    }
    return yield* commit(
      blueprint,
      "design",
      `Updated the storyline: ${story}`,
    );
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

async function authorDesignDoc(
  prompt: string,
  title: string,
  pack: ReturnType<typeof pickGenrePack>,
  fidelity: FidelityLevel,
  llm: LLMClient,
): Promise<GameDesignDoc> {
  const fallback = pack.design(title, prompt, fidelity);
  const { text, source } = await llm.generate(
    generatePrompt.gameDesign(prompt, title, pack.kind, fidelity),
    { task: "gameDesign" },
  );
  if (source !== "llm") return fallback;
  const parsed = safeParseJson(text);
  if (!parsed) return fallback;
  return {
    ...fallback,
    pitch: typeof parsed.pitch === "string" && parsed.pitch.length > 0 ? parsed.pitch : fallback.pitch,
    visualStyle:
      typeof parsed.visualStyle === "string" ? parsed.visualStyle : fallback.visualStyle,
    artDirection:
      typeof parsed.artDirection === "string" ? parsed.artDirection : fallback.artDirection,
    palette: Array.isArray(parsed.palette)
      ? parsed.palette.filter((c): c is string => typeof c === "string")
      : fallback.palette,
    systems: {
      ...fallback.systems,
      ...(typeof parsed.systems === "object" && parsed.systems
        ? (parsed.systems as Partial<GameDesignDoc["systems"]>)
        : {}),
    },
  };
}

async function authorWorldRecipe(
  title: string,
  pack: ReturnType<typeof pickGenrePack>,
  fidelity: FidelityLevel,
  llm: LLMClient,
): Promise<WorldRecipe> {
  const fallback = pack.world(title, fidelity);
  const { text, source } = await llm.generate(
    generatePrompt.worldRecipe(title, pack.kind, fidelity),
    { task: "worldRecipe" },
  );
  if (source !== "llm") return fallback;
  const parsed = safeParseJson(text);
  if (!parsed) return fallback;
  return {
    ...fallback,
    atmosphere:
      typeof parsed.atmosphere === "string" ? parsed.atmosphere : fallback.atmosphere,
    worldRadius:
      typeof parsed.worldRadius === "number" ? parsed.worldRadius : fallback.worldRadius,
    globalAmbient: Array.isArray(parsed.globalAmbient)
      ? parsed.globalAmbient.filter((a): a is string => typeof a === "string")
      : fallback.globalAmbient,
    interactive: Array.isArray(parsed.interactive)
      ? parsed.interactive.filter((a): a is string => typeof a === "string")
      : fallback.interactive,
  };
}

function safeParseJson(text: string): Record<string, unknown> | null {
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
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

/**
 * Detect a storyline / plot / pitch rewrite and extract the new text. Matches
 * either an explicit "storyline: ..." prefix or a "change/make the story ..."
 * instruction so follow-ups can iterate on narrative, not just visuals.
 */
function matchStoryEdit(message: string): string | null {
  const prefixed = message.match(
    /^\s*(?:storyline|story|plot|pitch|lore|narrative)\s*[:-]\s*(.+)$/i,
  );
  if (prefixed) return prefixed[1].trim();

  const instruction = message.match(
    /\b(?:change|update|rewrite|set|make)\b.*\b(?:storyline|story|plot|pitch|narrative)\b\s*(?:to|:|so that|into)?\s*(.+)$/i,
  );
  if (instruction && instruction[1].trim().length > 3) {
    return instruction[1].trim();
  }
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
