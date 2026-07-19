/**
 * Authors a complete gameplay TypeScript module from the prefilled scaffold.
 * Even without a live LLM, every package ships a full rules/controller script
 * that mirrors {@link GameRuntimeSpec}. When the LLM is available it may
 * polish comments — the structural body always comes from this prefill.
 */

import type { ControlProfile, GameDesignDoc, GameRuntimeSpec } from "@ai-gamedev/shared";

export function authorGameplayScript(options: {
  design: GameDesignDoc;
  runtime: GameRuntimeSpec;
  controls: ControlProfile;
  llmSnippet?: string;
}): string {
  const { design, runtime, controls, llmSnippet } = options;
  const lines: string[] = [];

  lines.push("/**");
  lines.push(` * ${design.title} — gameplay systems`);
  lines.push(` * Genre: ${runtime.genre} · Scheme: ${runtime.controlScheme} · Difficulty: ${runtime.difficulty}`);
  lines.push(` * Prefill scaffold generated from the player prompt; refine freely.`);
  lines.push(" *");
  lines.push(` * Win: ${runtime.rules.winCondition}`);
  lines.push(` * Lose: ${runtime.rules.loseCondition}`);
  lines.push(" */");
  lines.push("");
  lines.push("export type GameStatus = \"playing\" | \"won\" | \"lost\";");
  lines.push("");
  lines.push("export interface ObjectiveState {");
  lines.push("  id: string;");
  lines.push("  label: string;");
  lines.push("  type: string;");
  lines.push("  target: number;");
  lines.push("  progress: number;");
  lines.push("  optional?: boolean;");
  lines.push("}");
  lines.push("");
  lines.push("export interface GameState {");
  lines.push("  status: GameStatus;");
  lines.push("  score: number;");
  lines.push("  health: number;");
  lines.push("  stamina: number;");
  lines.push("  ammo: number;");
  lines.push("  lives: number;");
  lines.push("  lap: number;");
  lines.push("  checkpointsThisLap: number;");
  lines.push("  shotsFired: number;");
  lines.push("  elapsedSec: number;");
  lines.push("  message: string;");
  lines.push("  objectives: ObjectiveState[];");
  lines.push("}");
  lines.push("");
  lines.push("export const CONTROLS = " + JSON.stringify(controls, null, 2) + " as const;");
  lines.push("");
  lines.push("export const RULES = " + JSON.stringify({
    winCondition: runtime.rules.winCondition,
    loseCondition: runtime.rules.loseCondition,
    timeLimitSec: runtime.rules.timeLimitSec,
    features: runtime.features,
    racing: runtime.racing ?? null,
    combat: runtime.combat ?? null,
    exploration: runtime.exploration ?? null,
    scoring: runtime.scoring,
    player: runtime.player,
  }, null, 2) + " as const;");
  lines.push("");
  lines.push("export function createInitialState(): GameState {");
  lines.push("  return {");
  lines.push(`    status: "playing",`);
  lines.push(`    score: ${runtime.scoring.points},`);
  lines.push(`    health: ${runtime.player.health},`);
  lines.push(`    stamina: ${runtime.player.stamina},`);
  lines.push(`    ammo: ${runtime.player.ammo},`);
  lines.push(`    lives: ${runtime.player.lives},`);
  lines.push("    lap: 0,");
  lines.push("    checkpointsThisLap: 0,");
  lines.push("    shotsFired: 0,");
  lines.push("    elapsedSec: 0,");
  lines.push(`    message: ${JSON.stringify(runtime.narrative.intro)},`);
  lines.push("    objectives: " + JSON.stringify(
    runtime.objectives.map((o) => ({
      id: o.id,
      label: o.label,
      type: o.type,
      target: o.target,
      progress: 0,
      optional: o.optional,
    })),
    null,
    2,
  ).split("\n").map((l, i) => (i === 0 ? l : `    ${l}`)).join("\n") + ",");
  lines.push("  };");
  lines.push("}");
  lines.push("");
  lines.push("export function tick(state: GameState, dt: number): GameState {");
  lines.push("  if (state.status !== \"playing\") return state;");
  lines.push("  const next = { ...state, elapsedSec: state.elapsedSec + dt };");
  if (runtime.rules.timeLimitSec) {
    lines.push(`  if (next.elapsedSec >= ${runtime.rules.timeLimitSec}) {`);
    lines.push(`    return fail(next, ${JSON.stringify(runtime.narrative.loseText)});`);
    lines.push("  }");
  }
  lines.push("  if (next.health <= 0) {");
  lines.push("    next.lives -= 1;");
  lines.push("    if (next.lives <= 0) return fail(next, " + JSON.stringify(runtime.narrative.loseText) + ");");
  lines.push(`    next.health = ${runtime.player.maxHealth};`);
  lines.push(`    next.message = "Lost a life — ${runtime.player.lives} total configured.";`);
  lines.push("  }");
  lines.push("  if (objectivesMet(next)) return win(next, " + JSON.stringify(runtime.narrative.winText) + ");");
  lines.push("  return next;");
  lines.push("}");
  lines.push("");
  lines.push("export function onInteract(state: GameState, tag: string): GameState {");
  lines.push("  if (state.status !== \"playing\") return state;");
  lines.push("  let next = { ...state, objectives: state.objectives.map((o) => ({ ...o })) };");
  lines.push("  if (tag === \"collect\" || tag === \"loot\") {");
  lines.push("    next = bumpObjective(next, \"collect\", 1);");
  lines.push(`    next.score += ${runtime.scoring.collectBonus};`);
  lines.push("    next.message = \"Collected a relic.\";");
  lines.push("  }");
  lines.push("  if (tag === \"reach\" || tag === \"landmark\") {");
  lines.push("    next = bumpObjective(next, \"reach\", 1);");
  lines.push("    next.message = \"Landmark discovered.\";");
  lines.push("  }");
  lines.push("  if (objectivesMet(next)) return win(next, " + JSON.stringify(runtime.narrative.winText) + ");");
  lines.push("  return next;");
  lines.push("}");
  lines.push("");
  lines.push("export function onCheckpoint(state: GameState, checkpointId: string): GameState {");
  lines.push("  if (state.status !== \"playing\") return state;");
  if (runtime.racing) {
    lines.push("  let next = { ...state, objectives: state.objectives.map((o) => ({ ...o })) };");
    lines.push("  next = bumpObjective(next, \"checkpoint\", 1);");
    lines.push(`  next.score += ${runtime.scoring.checkpointBonus};`);
    lines.push("  next.checkpointsThisLap += 1;");
    lines.push(`  if (next.checkpointsThisLap >= ${runtime.racing.checkpointsPerLap}) {`);
    lines.push("    next.checkpointsThisLap = 0;");
    lines.push("    next.lap += 1;");
    lines.push("    next = bumpObjective(next, \"lap\", 1);");
    lines.push(`    next.score += ${runtime.scoring.lapBonus};`);
    lines.push("    next.message = `Lap ${next.lap}/${RULES.racing?.laps ?? 0}`;");
    lines.push("  } else {");
    lines.push("    next.message = `Checkpoint ${checkpointId}`;");
    lines.push("  }");
    lines.push("  if (objectivesMet(next)) return win(next, " + JSON.stringify(runtime.narrative.winText) + ");");
    lines.push("  return next;");
  } else {
    lines.push("  void checkpointId;");
    lines.push("  return state;");
  }
  lines.push("}");
  lines.push("");
  lines.push("export function onFire(state: GameState): GameState {");
  if (runtime.features.fire) {
    lines.push("  if (state.status !== \"playing\") return state;");
    lines.push("  if (state.ammo <= 0) {");
    if (runtime.features.reload) {
      lines.push(`    return { ...state, ammo: ${runtime.player.maxAmmo}, message: "Reloaded." };`);
    } else {
      lines.push('    return { ...state, message: "Empty." };');
    }
    lines.push("  }");
    lines.push("  return {");
    lines.push("    ...state,");
    lines.push("    ammo: state.ammo - 1,");
    lines.push("    shotsFired: state.shotsFired + 1,");
    lines.push("    message: \"Fire!\",");
    lines.push("  };");
  } else {
    lines.push("  return state;");
  }
  lines.push("}");
  lines.push("");
  lines.push("export function onReload(state: GameState): GameState {");
  if (runtime.features.reload) {
    lines.push(`  return { ...state, ammo: ${runtime.player.maxAmmo}, message: "Magazine full." };`);
  } else {
    lines.push("  return state;");
  }
  lines.push("}");
  lines.push("");
  lines.push("function bumpObjective(state: GameState, type: string, amount: number): GameState {");
  lines.push("  const objectives = state.objectives.map((o) => {");
  lines.push("    if (o.type !== type || o.progress >= o.target) return o;");
  lines.push("    return { ...o, progress: Math.min(o.target, o.progress + amount) };");
  lines.push("  });");
  lines.push("  return { ...state, objectives };");
  lines.push("}");
  lines.push("");
  lines.push("function objectivesMet(state: GameState): boolean {");
  lines.push("  return state.objectives.filter((o) => !o.optional).every((o) => o.progress >= o.target);");
  lines.push("}");
  lines.push("");
  lines.push("function win(state: GameState, message: string): GameState {");
  lines.push("  return { ...state, status: \"won\", message };");
  lines.push("}");
  lines.push("");
  lines.push("function fail(state: GameState, message: string): GameState {");
  lines.push("  return { ...state, status: \"lost\", message };");
  lines.push("}");
  lines.push("");
  lines.push("/** Control helpers — mirror the viewport binding profile. */");
  lines.push("export function isDown(action: string, keys: Set<string>): boolean {");
  lines.push("  const binding = CONTROLS.bindings.find((b) => b.action === action);");
  lines.push("  return !!binding && binding.keys.some((k) => keys.has(k));");
  lines.push("}");
  lines.push("");

  if (llmSnippet && llmSnippet.trim().length > 40 && !llmSnippet.includes("【mock】")) {
    lines.push("// --- LLM-authored extension (merged below the scaffold) ---");
    lines.push(llmSnippet.trim());
    lines.push("");
  }

  lines.push(`export const HUD_LINE = ${JSON.stringify(controls.hudLine)};`);
  lines.push(`export const INTRO = ${JSON.stringify(runtime.narrative.intro)};`);
  lines.push("");

  return lines.join("\n");
}
