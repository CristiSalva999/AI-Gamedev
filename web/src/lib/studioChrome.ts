import type { GameBlueprint } from "@ai-gamedev/shared";

/** Prefer the active required objective so HUD chrome stays focused. */
export function primaryObjectiveLabel(blueprint: GameBlueprint): string {
  const objectives = blueprint.runtime?.objectives ?? [];
  const primary =
    objectives.find((o) => !o.optional && o.progress < o.target) ??
    objectives.find((o) => !o.optional) ??
    objectives[0];
  return primary?.label ?? blueprint.pitch;
}

export interface ViewportInspectorStats {
  title: string;
  genre: string;
  scheme: string;
  lighting: string;
  entities: number;
  enemies: number;
  objective: string;
  difficulty: string | null;
}

/** Compact stats strip for the preview chrome (outside the 3D canvas). */
export function inspectorStats(blueprint: GameBlueprint | null): ViewportInspectorStats | null {
  if (!blueprint) return null;
  return {
    title: blueprint.gameTitle,
    genre: blueprint.gameGenre,
    scheme: blueprint.controls?.scheme ?? blueprint.design?.systems.controlScheme ?? "walk",
    lighting: blueprint.environment.lighting,
    entities: blueprint.entities.length,
    enemies: blueprint.entities.filter((e) => e.role === "enemy").length,
    objective: primaryObjectiveLabel(blueprint),
    difficulty: blueprint.runtime?.difficulty ?? null,
  };
}

/** Contextual steer chips — genre-aware, not a generic pill dump. */
export function steerSuggestionsFor(blueprint: GameBlueprint | null): string[] {
  const scheme = blueprint?.controls?.scheme ?? blueprint?.design?.systems.controlScheme;
  const genre = blueprint?.gameGenre ?? "";
  const base = ["make it night", "player faster"];

  if (scheme === "fps" || genre === "shooter") {
    return [
      "fix the game so I can shoot dwarfs",
      "make it dusk",
      "add more crates",
      "player faster",
      "storyline: a quiet hunt before the mountain storm",
    ];
  }
  if (scheme === "drive" || genre === "racing") {
    return [
      "make it night",
      "add more barriers",
      "player faster",
      "storyline: last lap under the floodlights",
    ];
  }
  return [
    ...base,
    "add more trees",
    "storyline: a lone explorer races the coming storm",
  ];
}
