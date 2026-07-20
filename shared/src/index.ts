/**
 * Shared domain contract between the frontend viewport and the backend
 * orchestrator. Keeping a single source of truth here avoids drift between the
 * two runtimes (DRY) and documents the pipeline's data model in one place.
 */

export type {
  MaterialHint,
  MeshPart,
  PrefabDefinition,
  PrefabKind,
  PrimitiveShape,
} from "./prefabs.js";
export {
  buildPrefab,
  prefabForBrief,
  scalePrefab,
} from "./prefabs.js";

export type {
  CameraMode,
  ControlScheme,
  FidelityLevel,
  GameDesignDoc,
  GameplaySystemsSpec,
  GenreKind,
  PostFxSpec,
  TerrainKind,
  TerrainSpec,
  WorldRecipe,
  ZoneSpec,
} from "./gameDesign.js";
export {
  defaultPostFx,
  defaultTerrain,
  inferGenreKind,
} from "./gameDesign.js";

export type {
  PlannedSubRequest,
  PlannedTask,
  RequestPlan,
} from "./planning.js";
export {
  coercePlan,
  extractObjective,
  extractSetting,
  extractTitle,
  heuristicPlan,
  summarizePlan,
} from "./planning.js";

export type {
  GameSetupAnswers,
  ProjectMeta,
  SetupQuestion,
  SetupTimeOfDay,
} from "./setup.js";
export {
  composeSetupPrompt,
  DEFAULT_SETUP_ANSWERS,
  GENRE_KINDS,
  SETUP_QUESTIONS,
  SETUP_TIMES,
} from "./setup.js";

export type { SettingLighting, SettingMotif, SettingMotifId } from "./settingMotif.js";
export {
  detectLightingFromPrompt,
  detectSettingMotif,
  extractStoryline,
} from "./settingMotif.js";

export { enrichDefinition } from "./detail.js";
export {
  fbm,
  hash2,
  sampleTerrainHeight,
  smoothNoise,
} from "./terrain.js";

export type { ControlAction, ControlBinding, ControlProfile } from "./controls.js";
export {
  actionAxis,
  controlProfileFor,
  defaultSchemeForGenre,
  isActionDown,
  profileKeyCodes,
} from "./controls.js";

export type {
  CombatRules,
  ExplorationRules,
  GameRuntimeSpec,
  GameSessionState,
  NarrativeBeats,
  ObjectiveType,
  PlayerStatsSpec,
  RacingRules,
  RuntimeObjective,
  ScoringRules,
} from "./gameRuntime.js";
export { createSessionState, objectivesComplete } from "./gameRuntime.js";
export {
  formatSessionHud,
  sessionOnCheckpoint,
  sessionOnCollect,
  sessionOnFire,
  sessionOnReach,
  sessionOnReload,
  tickSession,
} from "./sessionLogic.js";

import type { ControlProfile } from "./controls.js";
import type {
  FidelityLevel,
  GameDesignDoc,
  PostFxSpec,
  TerrainSpec,
  WorldRecipe,
} from "./gameDesign.js";
import type { GameRuntimeSpec } from "./gameRuntime.js";
import type { RequestPlan } from "./planning.js";
import type { MeshPart, PrefabKind, PrimitiveShape } from "./prefabs.js";

// ---------------------------------------------------------------------------
// Core entities
// ---------------------------------------------------------------------------

export interface Asset {
  id: string;
  name: string;
  /** Path or URL to the rendered artifact (e.g. a .glb produced by Blender). */
  source?: string;
  /** Procedural description used by the viewport to build a placeholder mesh. */
  spec: AssetSpec;
  /** When set, mesh came from the vendored CC0 kit (`server/asset-kit`). */
  kitId?: string;
  /** Browser URL for the .glb (kit or per-game assets route). */
  modelUrl?: string;
  createdAt: number;
}

export interface Material {
  id: string;
  name: string;
  color: string;
  roughness?: number;
  metalness?: number;
}

export interface NPC {
  id: string;
  name: string;
  role: string;
  personality: string;
  background: string;
  relationships: Record<string, string>;
}

/**
 * Renderer-agnostic description of a generated asset. Prefer `parts` (compound
 * prefab) for readable set pieces; `shape` remains the single-primitive
 * fallback used by simple exporters and older runners.
 */
export interface AssetSpec {
  shape: PrimitiveShape;
  color: string;
  /** Bounding dimensions in world units (used for placement / collision). */
  size: { x: number; y: number; z: number };
  roughness: number;
  metalness: number;
  /** Named prefab used to rebuild compound geometry. */
  prefab?: PrefabKind;
  /** Multi-mesh parts; when present the viewport builds a Group. */
  parts?: MeshPart[];
  /** Visual richness used when expanding this asset. */
  fidelity?: FidelityLevel;
}

export interface ConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Animations (keyframe clips attached to entities / player)
// ---------------------------------------------------------------------------

export type AnimationTarget =
  | "position.y"
  | "position.x"
  | "rotation.y"
  | "scale.y";

/** A single sampled property track. Values are relative to the entity's base pose. */
export interface KeyframeTrack {
  target: AnimationTarget;
  /** Times in seconds. */
  times: number[];
  values: number[];
  loop: boolean;
}

export interface AnimationClip {
  id: string;
  name: string;
  duration: number;
  tracks: KeyframeTrack[];
}

// ---------------------------------------------------------------------------
// Game context (the shared "brain state")
// ---------------------------------------------------------------------------

export interface GameContext {
  gameTitle: string;
  gameGenre: string;
  targetPlatform: string;
  visualStyle: string;
  colorPalette?: string[];

  assets: {
    models: Record<string, Asset>;
    materials: Record<string, Material>;
    characters: Record<string, NPC>;
  };

  mechanics: string[];
  currentMission?: string;
  playerInventory: string[];
  worldState: Record<string, unknown>;

  generatedScripts: Record<string, string>;
  completedTasks: string[];
  pendingTasks: string[];

  conversationMemory: ConversationTurn[];

  /** The most recently built game, rendered by the viewport. */
  blueprint?: GameBlueprint;
  /** Last successful package manifest (downloadable build). */
  lastManifest?: BuildManifest;
  /** Persisted chat transcript that drives the autonomous pipeline. */
  chat: ChatMessage[];
}

// ---------------------------------------------------------------------------
// Game blueprint (the buildable, renderable output of the pipeline)
// ---------------------------------------------------------------------------

export type LightingMood = "day" | "dusk" | "night" | "cave";

export interface EnvironmentSpec {
  lighting: LightingMood;
  atmosphere: string;
  fog: boolean;
  groundColor: string;
  skyColor: string;
  /** Half-extent of the playable ground plane (world units). */
  worldRadius?: number;
  /** Soft secondary ground tint for grass / dirt variation. */
  accentGroundColor?: string;
  /** Optional structured terrain / post-FX from the world recipe. */
  terrain?: TerrainSpec;
  postFx?: PostFxSpec;
}

export type EntityBehavior = "static" | "spin" | "bob" | "patrol" | "pulse";

/** How an entity contributes to the level — drives motion and interaction. */
export type EntityRole = "landmark" | "ambient" | "loot" | "path";

export interface BlueprintEntity {
  id: string;
  name: string;
  spec: AssetSpec;
  position: { x: number; y: number; z: number };
  /** Yaw in radians for oriented set pieces (arches, walls). */
  rotationY?: number;
  behavior: EntityBehavior;
  /** Optional authored keyframe clip (drives the viewport beyond simple behaviors). */
  animation?: AnimationClip;
  interactive: boolean;
  role?: EntityRole;
  /** Short prompt shown when the player is near an interactive prop. */
  interactHint?: string;
  /**
   * Optional URL to a real .glb (vendored kit or packaged game asset).
   * When set, the viewport prefers GLTFLoader over procedural `spec` meshes.
   */
  modelUrl?: string;
  /** Kit entry id when the mesh came from the CC0 asset kit. */
  kitId?: string;
}

export interface PlayerSpec {
  color: string;
  /** Movement speed in world units per second. */
  speed: number;
  spawn: { x: number; y: number; z: number };
  /** Idle / walk clips used by the playable preview. */
  animations: {
    idle: AnimationClip;
    walk: AnimationClip;
  };
  /** Controllable avatar kind — walk capsule or driveable car. */
  avatar?: "capsule" | "car";
  /** Max turn rate for drive controls (rad/s). */
  turnSpeed?: number;
  acceleration?: number;
}

export interface GameBlueprint {
  gameTitle: string;
  gameGenre: string;
  visualStyle: string;
  colorPalette: string[];
  pitch: string;
  environment: EnvironmentSpec;
  entities: BlueprintEntity[];
  player: PlayerSpec;
  mechanics: string[];
  scripts: Record<string, string>;
  /** Shared animation library referenced by entities. */
  animations: Record<string, AnimationClip>;
  /** Clarified request + hierarchical decomposition that drove this build. */
  plan?: RequestPlan;
  /** Structured design doc from the LLM / mock design pass. */
  design?: GameDesignDoc;
  /** Structured world recipe driving terrain, zones, and post-FX. */
  worldRecipe?: WorldRecipe;
  /** Resolved input map for this build (drive / fps / walk / …). */
  controls?: ControlProfile;
  /**
   * Prefill complete game logic (objectives, stats, win/lose, combat/race
   * rules) modeled on the user prompt + genre pack.
   */
  runtime?: GameRuntimeSpec;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Autonomous build pipeline (chat-driven)
// ---------------------------------------------------------------------------

export type BuildStage =
  | "plan"
  | "design"
  | "world"
  | "assets"
  | "scripts"
  | "animations"
  | "player"
  | "assemble"
  | "package";

export interface BuildManifest {
  name: string;
  slug: string;
  branch: string;
  /** True when a real git workspace/branch was created on disk. */
  branchCreated: boolean;
  entityCount: number;
  assetCount: number;
  scriptCount: number;
  animationCount: number;
  approxSizeKb: number;
  /** Absolute or API-relative path to the packaged zip. */
  downloadUrl: string;
  /** On-disk game project directory (server-local). */
  installPath: string;
  packageFormat: "zip+html";
}

/**
 * Streamed pipeline event. The frontend renders these as chat updates and live
 * "sneak peeks" of the game being built. Discriminated on `type`.
 */
export type BuildEvent =
  | { type: "message"; role: "assistant"; content: string }
  | { type: "stage-start"; stage: BuildStage; label: string }
  | { type: "sneak-peek"; stage: BuildStage; note: string; blueprint: GameBlueprint }
  | { type: "stage-complete"; stage: BuildStage }
  | { type: "artifact"; manifest: BuildManifest }
  | { type: "done"; blueprint: GameBlueprint }
  | { type: "error"; message: string };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  at: number;
}

export interface ChatRequest {
  message: string;
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export type GenerateTask =
  | "npcDialogue"
  | "modelGeneration"
  | "worldBuilding"
  | "codeGeneration"
  | "gameDesign"
  | "worldRecipe"
  | "freeform";

export interface GenerateRequest {
  task: GenerateTask;
  /** Raw prompt override. When omitted the server builds one from `params`. */
  prompt?: string;
  params?: Record<string, unknown>;
}

export type GenerationSource = "llm" | "mock" | "blender" | "kit";

export interface GenerateResponse {
  text: string;
  source: GenerationSource;
  model: string;
}

export interface GenerateAssetRequest {
  brief: string;
}

export interface GenerateAssetResponse {
  asset: Asset;
  /** The (mock or LLM-authored) Blender Python that "produced" the asset. */
  blenderScript: string;
  source: GenerationSource;
}

export interface HealthResponse {
  status: "ok";
  llm: {
    configured: boolean;
    reachable: boolean;
    model: string;
    baseUrl: string;
  };
  blender: {
    available: boolean;
    mode: "blender" | "procedural";
    /** Resolved blender.exe path when available. */
    path?: string;
    /** Actionable hint when Blender was not found. */
    hint?: string;
  };
  /** Vendored CC0 kit used as mesh bases when briefs match. */
  assetKit?: {
    entries: number;
  };
}

// ---------------------------------------------------------------------------
// Pure helpers (safe to run in either runtime)
// ---------------------------------------------------------------------------

/** Factory for a fresh, valid {@link GameContext}. */
export function createDefaultContext(
  overrides: Partial<GameContext> = {},
): GameContext {
  return {
    gameTitle: "Untitled Quest",
    gameGenre: "Action RPG",
    targetPlatform: "web",
    visualStyle: "cinematic detailed stylized",
    colorPalette: ["#2ecc71", "#8b5a2b", "#c4a574", "#3d6b45"],
    assets: { models: {}, materials: {}, characters: {} },
    mechanics: ["exploration", "interact", "collect"],
    playerInventory: [],
    worldState: {},
    generatedScripts: {},
    completedTasks: [],
    pendingTasks: [],
    conversationMemory: [],
    chat: [],
    ...overrides,
  };
}

/** A small, deterministic sample NPC used by the UI and tests. */
export function createSampleNpc(): NPC {
  return {
    id: "npc_elowen",
    name: "Elowen",
    role: "village herbalist",
    personality: "wry, warm, secretly anxious",
    background: "Keeper of the old greenhouse on the hill.",
    relationships: { player: "curious", mayor: "distrustful" },
  };
}

/** Idle bob for the player avatar when standing still. */
export function createIdleClip(): AnimationClip {
  return {
    id: "anim_player_idle",
    name: "idle",
    duration: 2,
    tracks: [
      {
        target: "position.y",
        times: [0, 1, 2],
        values: [0, 0.06, 0],
        loop: true,
      },
    ],
  };
}

/** Subtle vertical bounce while the player is moving. */
export function createWalkClip(): AnimationClip {
  return {
    id: "anim_player_walk",
    name: "walk",
    duration: 0.5,
    tracks: [
      {
        target: "position.y",
        times: [0, 0.25, 0.5],
        values: [0, 0.12, 0],
        loop: true,
      },
      {
        target: "scale.y",
        times: [0, 0.25, 0.5],
        values: [1, 0.94, 1],
        loop: true,
      },
    ],
  };
}

/** Spin clip used for decorative props. */
export function createSpinClip(id: string): AnimationClip {
  return {
    id,
    name: "spin",
    duration: 4,
    tracks: [
      {
        target: "rotation.y",
        times: [0, 4],
        values: [0, Math.PI * 2],
        loop: true,
      },
    ],
  };
}

/** Bob clip for interactive pickups. */
export function createBobClip(id: string): AnimationClip {
  return {
    id,
    name: "bob",
    duration: 2,
    tracks: [
      {
        target: "position.y",
        times: [0, 1, 2],
        values: [0, 0.35, 0],
        loop: true,
      },
    ],
  };
}

/** Side-to-side patrol for NPCs / creatures. */
export function createPatrolClip(id: string): AnimationClip {
  return {
    id,
    name: "patrol",
    duration: 4,
    tracks: [
      {
        target: "position.x",
        times: [0, 2, 4],
        values: [0, 2, 0],
        loop: true,
      },
    ],
  };
}

/** Scale pulse for magical props. */
export function createPulseClip(id: string): AnimationClip {
  return {
    id,
    name: "pulse",
    duration: 1.5,
    tracks: [
      {
        target: "scale.y",
        times: [0, 0.75, 1.5],
        values: [1, 1.18, 1],
        loop: true,
      },
    ],
  };
}

/**
 * Linearly samples a keyframe track at `time` seconds. Pure so the Three.js
 * viewport and the packaged HTML runner share the same math.
 */
export function sampleTrack(track: KeyframeTrack, time: number): number {
  const { times, values } = track;
  if (times.length === 0 || values.length === 0) return 0;
  if (time <= times[0]) return values[0];
  if (time >= times[times.length - 1]) return values[values.length - 1];
  for (let i = 0; i < times.length - 1; i++) {
    if (time >= times[i] && time <= times[i + 1]) {
      const span = times[i + 1] - times[i] || 1;
      const u = (time - times[i]) / span;
      return values[i] + (values[i + 1] - values[i]) * u;
    }
  }
  return values[0];
}

/** Samples every track of a clip at elapsed time `t` (loops when track.loop). */
export function sampleClip(
  clip: AnimationClip,
  t: number,
): Partial<Record<AnimationTarget, number>> {
  const local = clip.duration > 0 ? t % clip.duration : 0;
  const out: Partial<Record<AnimationTarget, number>> = {};
  for (const track of clip.tracks) {
    const time = track.loop ? local : Math.min(t, clip.duration);
    out[track.target] = sampleTrack(track, time);
  }
  return out;
}
