/**
 * Pure session transitions shared by the Three.js preview and unit tests.
 * Mirrors the authored gameplay.ts scaffold so runtime and script stay aligned.
 */

import type { GameRuntimeSpec, GameSessionState, RuntimeObjective } from "./gameRuntime.js";
import { objectivesComplete } from "./gameRuntime.js";

export function tickSession(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
  dt: number,
): GameSessionState {
  if (state.status !== "playing") return state;
  let next: GameSessionState = { ...state, elapsedSec: state.elapsedSec + dt };

  if (runtime.rules.timeLimitSec != null && next.elapsedSec >= runtime.rules.timeLimitSec) {
    return { ...next, status: "lost", message: runtime.narrative.loseText };
  }

  if (next.health <= 0) {
    next = { ...next, lives: next.lives - 1 };
    if (next.lives <= 0) {
      return { ...next, status: "lost", message: runtime.narrative.loseText };
    }
    next = {
      ...next,
      health: runtime.player.maxHealth,
      message: `Lost a life — ${next.lives} remaining`,
    };
  }

  if (objectivesComplete(next)) {
    return { ...next, status: "won", message: runtime.narrative.winText };
  }
  return next;
}

export function sessionOnCollect(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
): GameSessionState {
  if (state.status !== "playing") return state;
  let next = bump(state, "collect", 1);
  next = {
    ...next,
    score: next.score + runtime.scoring.collectBonus,
    message: "Collected!",
  };
  if (objectivesComplete(next)) {
    return { ...next, status: "won", message: runtime.narrative.winText };
  }
  return next;
}

export function sessionOnReach(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
): GameSessionState {
  if (state.status !== "playing") return state;
  let next = bump(state, "reach", 1);
  next = { ...next, message: "Landmark reached" };
  if (objectivesComplete(next)) {
    return { ...next, status: "won", message: runtime.narrative.winText };
  }
  return next;
}

export function sessionOnCheckpoint(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
  checkpointId: string,
): GameSessionState {
  if (state.status !== "playing" || !runtime.racing) return state;
  if (state.checkpointsHit.includes(checkpointId)) return state;

  let next: GameSessionState = {
    ...bump(state, "checkpoint", 1),
    checkpointsHit: [...state.checkpointsHit, checkpointId],
    checkpointsThisLap: state.checkpointsThisLap + 1,
    score: state.score + runtime.scoring.checkpointBonus,
    message: `Checkpoint`,
  };

  if (next.checkpointsThisLap >= runtime.racing.checkpointsPerLap) {
    next = {
      ...bump(next, "lap", 1),
      checkpointsThisLap: 0,
      lap: next.lap + 1,
      score: next.score + runtime.scoring.lapBonus,
      message: `Lap ${next.lap + 0}/${runtime.racing.laps}`,
    };
    // Fix message after lap bump — lap field already incremented.
    next = {
      ...next,
      message: `Lap ${next.lap}/${runtime.racing.laps}`,
    };
  }

  if (objectivesComplete(next)) {
    return { ...next, status: "won", message: runtime.narrative.winText };
  }
  return next;
}

export function sessionOnFire(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
): GameSessionState {
  if (state.status !== "playing" || !runtime.features.fire) return state;
  if (state.ammo <= 0) {
    if (runtime.features.reload) {
      return {
        ...state,
        ammo: runtime.player.maxAmmo,
        message: "Reloaded",
      };
    }
    return { ...state, message: "Empty" };
  }
  return {
    ...state,
    ammo: state.ammo - 1,
    shotsFired: state.shotsFired + 1,
    message: "Fire!",
  };
}

/**
 * Register a successful hit that eliminates an enemy (or finishes it off).
 * Advances `"eliminate"` objectives and awards {@link ScoringRules.killBonus}.
 */
export function sessionOnEliminate(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
  label = "Enemy down",
): GameSessionState {
  if (state.status !== "playing") return state;
  let next = bump(state, "eliminate", 1);
  next = {
    ...next,
    score: next.score + runtime.scoring.killBonus,
    message: label,
  };
  if (objectivesComplete(next)) {
    return { ...next, status: "won", message: runtime.narrative.winText };
  }
  return next;
}

export function sessionOnReload(
  state: GameSessionState,
  runtime: GameRuntimeSpec,
): GameSessionState {
  if (!runtime.features.reload) return state;
  return { ...state, ammo: runtime.player.maxAmmo, message: "Magazine full" };
}

export function formatSessionHud(state: GameSessionState, runtime: GameRuntimeSpec): string {
  const obj = state.objectives.find((o) => o.progress < o.target && !o.optional)
    ?? state.objectives[0];
  const objLine = obj ? `${obj.label} (${obj.progress}/${obj.target})` : "—";
  if (runtime.controlScheme === "drive" && runtime.racing) {
    return `Lap ${state.lap}/${runtime.racing.laps} · CP ${state.checkpointsThisLap}/${runtime.racing.checkpointsPerLap} · Score ${state.score} · ${objLine}`;
  }
  if (runtime.features.fire) {
    const archery = isArcheryRuntime(runtime);
    const ammoLabel = archery ? "Arrows" : "Ammo";
    return `HP ${state.health} · ${ammoLabel} ${state.ammo}/${runtime.player.maxAmmo} · Score ${state.score} · ${objLine}`;
  }
  return `HP ${state.health} · Score ${state.score} · Loot ${state.objectives.find((o) => o.type === "collect")?.progress ?? 0} · ${objLine}`;
}

/** Heuristic: bow/archery framing for HUD + projectile styling. */
export function isArcheryRuntime(runtime: GameRuntimeSpec): boolean {
  const blob = [
    runtime.rules.winCondition,
    runtime.narrative.intro,
    runtime.narrative.objectivePing,
    ...runtime.objectives.map((o) => o.label),
  ].join(" ");
  return /\b(archery|arrow|bow|dwarf|dwarves|marksman)\b/i.test(blob);
}

function bump(
  state: GameSessionState,
  type: RuntimeObjective["type"],
  amount: number,
): GameSessionState {
  return {
    ...state,
    objectives: state.objectives.map((o) => {
      if (o.type !== type || o.progress >= o.target) return o;
      return { ...o, progress: Math.min(o.target, o.progress + amount) };
    }),
  };
}
