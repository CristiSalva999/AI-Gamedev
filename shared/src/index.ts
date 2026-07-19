/**
 * Shared domain contract between the frontend viewport and the backend
 * orchestrator. Keeping a single source of truth here avoids drift between the
 * two runtimes (DRY) and documents the pipeline's data model in one place.
 */

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

export type PrimitiveShape = "box" | "sphere" | "cylinder" | "cone" | "torus";

/**
 * Minimal, renderer-agnostic description of a generated asset. In the full
 * pipeline this is derived from Blender output; the mock generator produces it
 * directly so the viewport can render something meaningful offline.
 */
export interface AssetSpec {
  shape: PrimitiveShape;
  color: string;
  /** Uniform-ish dimensions in world units. */
  size: { x: number; y: number; z: number };
  roughness: number;
  metalness: number;
}

export interface ConversationTurn {
  role: "system" | "user" | "assistant";
  content: string;
  timestamp: number;
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
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export type GenerateTask =
  | "npcDialogue"
  | "modelGeneration"
  | "worldBuilding"
  | "codeGeneration"
  | "freeform";

export interface GenerateRequest {
  task: GenerateTask;
  /** Raw prompt override. When omitted the server builds one from `params`. */
  prompt?: string;
  params?: Record<string, unknown>;
}

export type GenerationSource = "llm" | "mock";

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
    visualStyle: "stylized low-poly",
    colorPalette: ["#6c5ce7", "#00b894", "#fdcb6e", "#2d3436"],
    assets: { models: {}, materials: {}, characters: {} },
    mechanics: ["exploration", "dialogue"],
    playerInventory: [],
    worldState: {},
    generatedScripts: {},
    completedTasks: [],
    pendingTasks: [],
    conversationMemory: [],
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
