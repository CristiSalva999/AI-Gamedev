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

/**
 * Words that, when they appear directly before "game"/"gioco"/"experience",
 * are treated as an explicit genre declaration (highest-confidence signal).
 */
const DECLARED_GENRE_WORDS: Record<GenreKind, readonly string[]> = {
  racing: ["racing", "race", "kart", "driving"],
  shooter: ["shooter", "shooting", "fps"],
  dungeon: ["dungeon", "crawler", "roguelike"],
  horror: ["horror"],
  survival: ["survival"],
  exploration: ["exploration", "explorer", "adventure"],
  sandbox: ["sandbox"],
};

/**
 * Weighted keyword signals for the scoring fallback. Kept word-boundary strict
 * and free of loose stems (e.g. no bare "drift"/"car"/"track") so incidental
 * prose like "pollen drifting" or "soundtrack" cannot flip the genre.
 */
const GENRE_SIGNALS: Record<GenreKind, RegExp> = {
  racing: /\b(racing|race|races|arcade|kart|karts|circuit|raceway|speedway|lap|laps|veicol\w*|macchin\w*)\b/g,
  shooter: /\b(shooter|shoot|shooting|fps|blaster|gunfight|bullet|space station)\b/g,
  dungeon: /\b(dungeon|dungeons|crypt|tomb|crawler|catacomb)\b/g,
  horror: /\b(horror|haunted|zombie|zombies|ghost|ghosts|nightmare)\b/g,
  survival: /\b(survival|survive|survives|surviving|craft|crafting|hunger|thirst|stamina|scavenge|permadeath)\b/g,
  exploration: /\b(exploration|explore|explorer|exploring|adventure|forest|ruin|ruins|nature|grove|meadow|hike|hiking)\b/g,
  sandbox: /\b(sandbox|creative mode|build freely)\b/g,
};

const GENRE_PRIORITY: readonly GenreKind[] = [
  "racing",
  "shooter",
  "horror",
  "dungeon",
  "survival",
  "exploration",
  "sandbox",
];

/**
 * First layer of genre classification: honor an explicit "<genre> game"
 * declaration, choosing the earliest one in the text so the primary request
 * ("Create a survival game …") wins over incidental mentions later on.
 */
function detectDeclaredGenre(p: string): GenreKind | null {
  let best: { kind: GenreKind; index: number } | null = null;
  for (const kind of GENRE_PRIORITY) {
    for (const word of DECLARED_GENRE_WORDS[kind]) {
      const re = new RegExp(`\\b${word}\\b[\\s-]+(?:game|gioco|experience|sim|simulator)\\b`, "g");
      const match = re.exec(p);
      if (match && (best === null || match.index < best.index)) {
        best = { kind, index: match.index };
      }
    }
  }
  return best?.kind ?? null;
}

/** Second layer: weighted keyword scoring across the full prompt. */
function scoreGenre(p: string): GenreKind {
  let winner: GenreKind = "sandbox";
  let bestScore = 0;
  for (const kind of GENRE_PRIORITY) {
    const matches = p.match(GENRE_SIGNALS[kind]);
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      bestScore = score;
      winner = kind;
    }
  }
  return winner;
}

/**
 * Infer a genre kind from a free-text user prompt (offline-safe).
 *
 * Two layers of reasoning:
 *   1. An explicit "<genre> game" declaration always wins (e.g. the setup
 *      wizard emits "Create a survival game …").
 *   2. Otherwise, weighted keyword scoring picks the strongest signal, so a
 *      single stray keyword buried in a long brief cannot hijack the genre.
 */
export function inferGenreKind(prompt: string): GenreKind {
  const p = prompt.toLowerCase();
  return detectDeclaredGenre(p) ?? scoreGenre(p);
}
