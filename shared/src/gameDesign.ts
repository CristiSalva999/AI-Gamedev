/**
 * Structured game-design contract. The local LLM is prompted to fill this
 * JSON so the pipeline can assemble a near-final playable game (or a very
 * advanced semi-finished build) for any genre — exploration, arcade racing,
 * dungeon, sci-fi, etc. — without hard-coding a single aesthetic.
 */

export type GenreKind =
  | "exploration"
  | "racing"
  | "shooter"
  | "dungeon"
  | "survival"
  | "horror"
  | "sandbox";

export type ControlScheme = "walk" | "drive" | "fly" | "twin_stick" | "fps";

export type CameraMode = "orbit_follow" | "chase" | "top_down" | "first_person";

/** Target visual richness. The runtime always aims high; "draft" is for tests. */
export type FidelityLevel = "draft" | "standard" | "cinematic";

export type TerrainKind = "flat" | "rolling" | "mountainous" | "track_bowl" | "caves";

export interface PostFxSpec {
  bloom: boolean;
  vignette: boolean;
  fogDensity: number;
  saturation: number;
  contrast: number;
}

export interface TerrainSpec {
  kind: TerrainKind;
  /** Seed for deterministic height noise. */
  seed: number;
  heightScale: number;
  roughness: number;
  /** Segments along one axis of the heightfield. */
  resolution: number;
}

export interface ZoneSpec {
  id: string;
  name: string;
  purpose: string;
  center: { x: number; z: number };
  radius: number;
  /** Asset briefs that belong in this zone. */
  landmarks: string[];
  ambientDensity: number;
  mood: string;
}

export interface GameplaySystemsSpec {
  controlScheme: ControlScheme;
  cameraMode: CameraMode;
  objectives: string[];
  winCondition: string;
  /** Optional racing / score parameters. */
  raceLaps?: number;
  checkpointCount?: number;
  collectibleGoal?: number;
  /**
   * Optional override bindings. When omitted the runtime builds them from
   * {@link controlScheme} via `controlProfileFor`.
   */
  controlHints?: string[];
}

/**
 * Full design document produced by the design pass. Persisted on the blueprint
 * so the viewport and packager share one source of truth.
 */
export interface GameDesignDoc {
  title: string;
  genre: GenreKind;
  pitch: string;
  visualStyle: string;
  fidelity: FidelityLevel;
  palette: string[];
  systems: GameplaySystemsSpec;
  /** Free-form art direction the asset pass should honour. */
  artDirection: string;
}

export interface WorldRecipe {
  atmosphere: string;
  lighting: "day" | "dusk" | "night" | "cave";
  skyColor: string;
  groundColor: string;
  accentGroundColor: string;
  worldRadius: number;
  terrain: TerrainSpec;
  postFx: PostFxSpec;
  zones: ZoneSpec[];
  /** Global ambient briefs scattered outside zones. */
  globalAmbient: string[];
  interactive: string[];
}

export function defaultPostFx(fidelity: FidelityLevel): PostFxSpec {
  switch (fidelity) {
    case "draft":
      return { bloom: false, vignette: false, fogDensity: 0.01, saturation: 1, contrast: 1 };
    case "standard":
      return { bloom: true, vignette: true, fogDensity: 0.018, saturation: 1.05, contrast: 1.05 };
    case "cinematic":
      return { bloom: true, vignette: true, fogDensity: 0.022, saturation: 1.12, contrast: 1.08 };
    default: {
      const _never: never = fidelity;
      return _never;
    }
  }
}

export function defaultTerrain(kind: TerrainKind, fidelity: FidelityLevel): TerrainSpec {
  const resolution = fidelity === "cinematic" ? 96 : fidelity === "standard" ? 64 : 32;
  switch (kind) {
    case "flat":
      return { kind, seed: 1, heightScale: 0.05, roughness: 0.2, resolution };
    case "rolling":
      return { kind, seed: 42, heightScale: 1.8, roughness: 0.55, resolution };
    case "mountainous":
      return { kind, seed: 7, heightScale: 4.5, roughness: 0.75, resolution };
    case "track_bowl":
      return { kind, seed: 99, heightScale: 0.6, roughness: 0.35, resolution };
    case "caves":
      return { kind, seed: 13, heightScale: 2.2, roughness: 0.85, resolution };
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

/** Infer a genre kind from a free-text user prompt (offline-safe). */
export function inferGenreKind(prompt: string): GenreKind {
  const p = prompt.toLowerCase();
  if (/\b(race|racing|arcade|car|cars|kart|drift|track|veicol|macchin)/.test(p)) {
    return "racing";
  }
  if (/\b(shoot|fps|blaster|space station|neon|cyber)/.test(p)) return "shooter";
  if (/\b(dungeon|crypt|cave|tomb|crawler)/.test(p)) return "dungeon";
  if (/\b(horror|haunted|zombie|ghost)/.test(p)) return "horror";
  if (/\b(survival|craft|desert|sandbox)/.test(p)) return "survival";
  if (/\b(forest|ruin|explore|adventure|nature|grove)/.test(p)) return "exploration";
  return "sandbox";
}
