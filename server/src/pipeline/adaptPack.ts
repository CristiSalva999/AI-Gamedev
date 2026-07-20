/**
 * Adapt a genre pack to the user's plan/prompt so offline builds keep genre
 * systems (controls, camera) but replace the hard-coded aesthetic when the
 * setting clearly asks for something else (archery yard ≠ neon hangar).
 */
import {
  defaultTerrain,
  detectLightingFromPrompt,
  detectSettingMotif,
  extractStoryline,
  type FidelityLevel,
  type GameDesignDoc,
  type RequestPlan,
  type SettingMotif,
  type WorldRecipe,
} from "@ai-gamedev/shared";
import type { GenrePack } from "./genrePacks.js";

export interface AdaptedPack extends GenrePack {
  /** Motif applied on top of the genre pack (may be generic = no aesthetic swap). */
  motif: SettingMotif;
}

/**
 * Clone a pack and rewrite theme / design / world fallbacks from the plan.
 * Mechanics and control schemes stay with the genre.
 */
export function adaptPackToPlan(
  pack: GenrePack,
  plan: RequestPlan,
  prompt: string,
): AdaptedPack {
  const motif = detectSettingMotif(plan.title, plan.setting, plan.objective, extractStoryline(prompt), prompt);
  const lighting =
    detectLightingFromPrompt(prompt) ??
    detectLightingFromPrompt(plan.setting) ??
    pack.theme.environment.lighting;

  // Racing keeps its track kit unless the prompt is clearly a different world;
  // track geometry is gameplay-critical.
  const keepRacingKit = pack.kind === "racing";
  const applyMotifAssets = !keepRacingKit && motif.id !== "generic";

  const theme = structuredClone(pack.theme);
  if (applyMotifAssets) {
    theme.visualStyle = motif.visualStyle;
    theme.palette = [...motif.palette];
    theme.defaultAssets = [...motif.landmarks];
    theme.ambientAssets = [...motif.ambient];
    theme.environment.groundColor = motif.groundColor;
    theme.environment.skyColor = motif.skyColor;
    theme.environment.accentGroundColor = motif.accentGroundColor;
    theme.environment.atmosphere = motif.atmosphere;
    if (motif.terrainKind) {
      theme.environment.terrain = defaultTerrain(motif.terrainKind, "cinematic");
    }
  }
  theme.environment.lighting = lighting;
  // Keep a human-readable genre label that still mentions the setting.
  if (plan.setting && plan.setting.length > 2) {
    theme.genre = `${pack.theme.genre} — ${plan.setting}`;
  }

  const design = (title: string, userPrompt: string, fidelity: FidelityLevel): GameDesignDoc => {
    const base = pack.design(title, userPrompt, fidelity);
    if (!applyMotifAssets) {
      return {
        ...base,
        pitch: pitchFor(plan, motif, base.pitch),
        systems: {
          ...base.systems,
          objectives: objectivesFor(plan, base.systems.objectives),
          winCondition: plan.objective || base.systems.winCondition,
        },
      };
    }
    return {
      ...base,
      pitch: pitchFor(plan, motif, base.pitch),
      visualStyle: motif.visualStyle,
      palette: [...motif.palette],
      artDirection: `${motif.label}: ${motif.atmosphere}`,
      systems: {
        ...base.systems,
        objectives: objectivesFor(plan, base.systems.objectives),
        winCondition: plan.objective || base.systems.winCondition,
      },
    };
  };

  const world = (title: string, fidelity: FidelityLevel): WorldRecipe => {
    const base = pack.world(title, fidelity);
    if (!applyMotifAssets) {
      return { ...base, lighting };
    }
    const primaryLandmarks = motif.landmarks.slice(0, 4);
    const zones = base.zones.map((zone, i) =>
      i === 0
        ? {
            ...zone,
            name: plan.setting ? titleCase(plan.setting) : zone.name,
            landmarks: primaryLandmarks,
            mood: motif.label,
          }
        : {
            ...zone,
            landmarks: motif.landmarks.slice(2, 5).length
              ? motif.landmarks.slice(2, 5)
              : zone.landmarks,
          },
    );
    return {
      ...base,
      atmosphere: motif.atmosphere,
      lighting,
      skyColor: motif.skyColor,
      groundColor: motif.groundColor,
      accentGroundColor: motif.accentGroundColor,
      terrain: motif.terrainKind
        ? defaultTerrain(motif.terrainKind, fidelity)
        : base.terrain,
      zones,
      globalAmbient: [...motif.ambient],
      interactive: [...motif.interactive],
    };
  };

  return {
    kind: pack.kind,
    mechanics: [...pack.mechanics],
    theme,
    design,
    world,
    motif,
  };
}

function pitchFor(plan: RequestPlan, motif: SettingMotif, fallback: string): string {
  const story = plan.goal || fallback;
  if (motif.id === "generic") return story;
  return `${story} The world reads as ${motif.label}.`;
}

function objectivesFor(plan: RequestPlan, fallback: string[]): string[] {
  if (plan.objective) return [plan.objective, ...plan.keyFeatures.slice(0, 2)];
  return fallback;
}

function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .slice(0, 5)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}
