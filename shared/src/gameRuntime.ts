/**
 * Complete runtime contract for a generated vertical slice. The pipeline
 * prefills this from the genre pack + user prompt so every build ships with
 * win/lose rules, objectives, player stats, and scoring — not just scenery.
 */

import type { ControlScheme, GenreKind } from "./gameDesign.js";

export type ObjectiveType =
  | "collect"
  | "reach"
  | "checkpoint"
  | "lap"
  | "survive"
  | "eliminate"
  | "explore";

export interface RuntimeObjective {
  id: string;
  label: string;
  type: ObjectiveType;
  /** How many times / how much to complete. */
  target: number;
  progress: number;
  optional?: boolean;
  rewardScore?: number;
}

export interface PlayerStatsSpec {
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  ammo: number;
  maxAmmo: number;
  lives: number;
  /** 0–1 damage reduction while aiming / crouching where relevant. */
  armor?: number;
}

export interface RacingRules {
  laps: number;
  checkpointsPerLap: number;
  falseStartGraceMs: number;
  ghostEnabled: boolean;
}

export interface CombatRules {
  fireCooldownSec: number;
  reloadSec: number;
  damagePerShot: number;
  spread: number;
  autoReload: boolean;
}

export interface ExplorationRules {
  interactRadius: number;
  sprintMultiplier: number;
  jumpForce: number;
}

export interface ScoringRules {
  points: number;
  collectBonus: number;
  checkpointBonus: number;
  lapBonus: number;
  killBonus: number;
  timeBonusPerSecond: number;
}

export interface NarrativeBeats {
  intro: string;
  objectivePing: string;
  winText: string;
  loseText: string;
}

/**
 * Full prefilled game logic attached to every blueprint. The viewport executes
 * a subset live; `gameplay.ts` mirrors the same rules as authored TypeScript.
 */
export interface GameRuntimeSpec {
  genre: GenreKind;
  controlScheme: ControlScheme;
  difficulty: "easy" | "normal" | "hard";
  rules: {
    winCondition: string;
    loseCondition: string;
    timeLimitSec: number | null;
  };
  player: PlayerStatsSpec;
  objectives: RuntimeObjective[];
  racing?: RacingRules;
  combat?: CombatRules;
  exploration?: ExplorationRules;
  scoring: ScoringRules;
  narrative: NarrativeBeats;
  /** Feature flags the runtime / script should honour. */
  features: {
    handbrake: boolean;
    boost: boolean;
    jump: boolean;
    sprint: boolean;
    fire: boolean;
    reload: boolean;
    aim: boolean;
    crouch: boolean;
    interact: boolean;
    checkpoints: boolean;
    lives: boolean;
    staminaDrain: boolean;
  };
}

/** Live mutable session state derived from {@link GameRuntimeSpec}. */
export interface GameSessionState {
  startedAt: number;
  elapsedSec: number;
  score: number;
  health: number;
  stamina: number;
  ammo: number;
  lives: number;
  objectives: RuntimeObjective[];
  lap: number;
  checkpointsThisLap: number;
  checkpointsHit: string[];
  shotsFired: number;
  status: "playing" | "won" | "lost";
  message: string;
}

export function createSessionState(runtime: GameRuntimeSpec, now = Date.now()): GameSessionState {
  return {
    startedAt: now,
    elapsedSec: 0,
    score: runtime.scoring.points,
    health: runtime.player.health,
    stamina: runtime.player.stamina,
    ammo: runtime.player.ammo,
    lives: runtime.player.lives,
    objectives: runtime.objectives.map((o) => ({ ...o, progress: 0 })),
    lap: 0,
    checkpointsThisLap: 0,
    checkpointsHit: [],
    shotsFired: 0,
    status: "playing",
    message: runtime.narrative.intro,
  };
}

export function objectivesComplete(state: GameSessionState): boolean {
  const required = state.objectives.filter((o) => !o.optional);
  return required.every((o) => o.progress >= o.target);
}
