/**
 * Prefill layer: turns a user prompt + genre pack into a *complete* game
 * scaffold (runtime rules, objectives, stats, features). The LLM may refine
 * copy later; this guarantees every build already has a full vertical-slice
 * logic surface modeled on the player's request.
 */

import {
  createSessionState,
  type GameDesignDoc,
  type GameRuntimeSpec,
  type GenreKind,
  type RuntimeObjective,
} from "@ai-gamedev/shared";
import type { GenrePack } from "./genrePacks.js";

export interface GameScaffold {
  runtime: GameRuntimeSpec;
  /** Seed session used by tests / packager README. */
  sessionPreview: ReturnType<typeof createSessionState>;
  /** Human summary streamed in the design/scripts stages. */
  summary: string;
}

/** Parse light intent modifiers from free text (laps, difficulty, collectibles…). */
export function parsePromptIntent(prompt: string): {
  difficulty: GameRuntimeSpec["difficulty"];
  laps?: number;
  collectGoal?: number;
  eliminateGoal?: number;
  timeLimitSec?: number;
  wantsBoost: boolean;
  wantsHardcore: boolean;
  /** Archery / dwarf-hunt framing for shooter builds. */
  wantsArcheryHunt: boolean;
} {
  const p = prompt.toLowerCase();
  const difficulty: GameRuntimeSpec["difficulty"] = /\b(hard|difficile|hardcore|nightmare)\b/.test(p)
    ? "hard"
    : /\b(easy|facile|casual)\b/.test(p)
      ? "easy"
      : "normal";

  const lapMatch =
    p.match(/\b(\d+)\s*(laps?|giri|giro)\b/) ?? p.match(/\b(laps?|giri)\s*(\d+)\b/);
  const laps = lapMatch
    ? Number(/\d/.test(lapMatch[1]) ? lapMatch[1] : lapMatch[2])
    : undefined;

  const collectMatch =
    p.match(/\b(\d+)\s*(relics?|orbs?|oggetti|items?)\b/) ??
    p.match(/\b(?:collect|raccogli|gather)\s+(\d+)\b/);
  const collectGoal = collectMatch ? Number(collectMatch[1]) : undefined;

  const eliminateMatch =
    p.match(/\b(\d+)\s*(dwarfs?|dwarves|enemies|targets?)\b/) ??
    p.match(/\b(?:shoot|kill|hunt|eliminate|defeat)\s+(\d+)\b/);
  const eliminateGoal = eliminateMatch ? Number(eliminateMatch[1]) : undefined;

  const timeMatch = p.match(/\b(\d+)\s*(min|minute|minutes|minuti)\b/);
  const timeLimitSec = timeMatch ? Number(timeMatch[1]) * 60 : undefined;

  const wantsArcheryHunt =
    /\b(archery|bow|arrow|marksman)\b/.test(p) ||
    /\b(dwarf|dwarves|dwarven|dwarv\w*)\b/.test(p);

  return {
    difficulty,
    laps: Number.isFinite(laps) ? laps : undefined,
    collectGoal: Number.isFinite(collectGoal) ? collectGoal : undefined,
    eliminateGoal: Number.isFinite(eliminateGoal) ? eliminateGoal : undefined,
    timeLimitSec,
    wantsBoost: /\b(boost|nitro|turbo)\b/.test(p),
    wantsHardcore: /\b(hardcore|permadeath|no.?checkpoint)\b/.test(p),
    wantsArcheryHunt,
  };
}

export function buildScaffold(
  prompt: string,
  pack: GenrePack,
  design: GameDesignDoc,
): GameScaffold {
  const intent = parsePromptIntent(prompt);
  const runtime = runtimeForGenre(pack.kind, design, intent, prompt);
  const sessionPreview = createSessionState(runtime);
  const summary = summarizeScaffold(runtime);
  return { runtime, sessionPreview, summary };
}

function runtimeForGenre(
  genre: GenreKind,
  design: GameDesignDoc,
  intent: ReturnType<typeof parsePromptIntent>,
  prompt: string,
): GameRuntimeSpec {
  const basePlayer = statsForDifficulty(intent.difficulty, genre);
  const narrative = {
    intro: design.pitch,
    objectivePing: design.systems.objectives[0] ?? "Complete your mission.",
    winText: `Victory — ${design.systems.winCondition}`,
    loseText: failTextFor(genre),
  };

  switch (genre) {
    case "racing": {
      const laps = intent.laps ?? design.systems.raceLaps ?? 3;
      const checkpoints = design.systems.checkpointCount ?? 6;
      const objectives: RuntimeObjective[] = [
        {
          id: "obj_checkpoints",
          label: `Pass all ${checkpoints} checkpoints each lap`,
          type: "checkpoint",
          target: checkpoints * laps,
          progress: 0,
          rewardScore: 100,
        },
        {
          id: "obj_laps",
          label: `Complete ${laps} laps`,
          type: "lap",
          target: laps,
          progress: 0,
          rewardScore: 500,
        },
      ];
      return {
        genre,
        controlScheme: "drive",
        difficulty: intent.difficulty,
        rules: {
          winCondition: design.systems.winCondition,
          loseCondition: intent.wantsHardcore
            ? "Fall off the track or miss 3 checkpoints"
            : "Abandon the race ( Esc )",
          timeLimitSec: intent.timeLimitSec ?? null,
        },
        player: { ...basePlayer, ammo: 0, maxAmmo: 0 },
        objectives,
        racing: {
          laps,
          checkpointsPerLap: checkpoints,
          falseStartGraceMs: 800,
          ghostEnabled: true,
        },
        scoring: {
          points: 0,
          collectBonus: 0,
          checkpointBonus: 120,
          lapBonus: 800,
          killBonus: 0,
          timeBonusPerSecond: 2,
        },
        narrative,
        features: featureFlags("drive", intent),
      };
    }
    case "shooter": {
      const hunt = intent.wantsArcheryHunt;
      const eliminateGoal =
        intent.eliminateGoal ?? (hunt ? 4 : design.systems.collectibleGoal ?? 5);
      const collectGoal = intent.collectGoal ?? (hunt ? 0 : design.systems.collectibleGoal ?? 5);
      const objectives: RuntimeObjective[] = hunt
        ? [
            {
              id: "obj_eliminate",
              label: `Shoot ${eliminateGoal} dwarfs`,
              type: "eliminate",
              target: eliminateGoal,
              progress: 0,
              rewardScore: 200,
            },
            {
              id: "obj_survive",
              label: "Stay alive",
              type: "survive",
              target: 1,
              progress: 0,
              optional: true,
            },
          ]
        : [
            {
              id: "obj_orbs",
              label: `Secure ${collectGoal} energy orbs`,
              type: "collect",
              target: collectGoal,
              progress: 0,
              rewardScore: 200,
            },
            {
              id: "obj_survive",
              label: "Stay alive",
              type: "survive",
              target: 1,
              progress: 0,
              optional: true,
            },
          ];
      const huntNarrative = hunt
        ? {
            ...narrative,
            intro:
              design.pitch ||
              "Hold the archery grounds — loose arrows at the dwarf raiders before they overrun the yard.",
            objectivePing: `Shoot ${eliminateGoal} dwarfs`,
            winText: `Victory — cleared ${eliminateGoal} dwarf raiders from the grounds`,
            loseText: "The dwarf raid overran your position",
          }
        : narrative;
      return {
        genre,
        controlScheme: "fps",
        difficulty: intent.difficulty,
        rules: {
          winCondition: hunt
            ? `Shoot ${eliminateGoal} dwarfs`
            : design.systems.winCondition,
          loseCondition: "Health reaches zero",
          timeLimitSec: intent.timeLimitSec ?? (intent.difficulty === "hard" ? 180 : null),
        },
        player: {
          ...basePlayer,
          // Archery: finite quiver; still reloadable (nock another arrow).
          ammo: hunt ? (intent.difficulty === "hard" ? 8 : 12) : basePlayer.ammo,
          maxAmmo: hunt ? (intent.difficulty === "hard" ? 8 : 12) : basePlayer.maxAmmo,
        },
        objectives,
        combat: {
          fireCooldownSec: hunt
            ? intent.difficulty === "hard"
              ? 0.35
              : 0.45
            : intent.difficulty === "hard"
              ? 0.12
              : 0.18,
          reloadSec: hunt ? 0.8 : 1.4,
          damagePerShot: intent.difficulty === "easy" ? 28 : 18,
          spread: intent.difficulty === "hard" ? 0.08 : 0.04,
          autoReload: true,
        },
        scoring: {
          points: 0,
          collectBonus: hunt ? 0 : 250,
          checkpointBonus: 0,
          lapBonus: 0,
          killBonus: hunt ? 150 : 100,
          timeBonusPerSecond: 1,
        },
        narrative: huntNarrative,
        features: featureFlags("fps", intent),
      };
    }
    case "exploration":
    case "dungeon":
    case "survival":
    case "horror":
    case "sandbox":
    default: {
      const goal =
        intent.collectGoal ??
        design.systems.collectibleGoal ??
        (genre === "sandbox" ? 3 : 3);
      const objectives: RuntimeObjective[] = [
        {
          id: "obj_collect",
          label: design.systems.objectives[1] ?? `Collect ${goal} relics`,
          type: "collect",
          target: goal,
          progress: 0,
          rewardScore: 150,
        },
        {
          id: "obj_reach",
          label: design.systems.objectives[0] ?? "Reach the main landmark",
          type: "reach",
          target: 1,
          progress: 0,
          rewardScore: 300,
        },
        {
          id: "obj_explore",
          label: "Explore the zones",
          type: "explore",
          target: Math.max(2, Math.min(4, design.systems.objectives.length || 2)),
          progress: 0,
          optional: true,
          rewardScore: 80,
        },
      ];
      return {
        genre,
        controlScheme: design.systems.controlScheme === "fps" ? "fps" : "walk",
        difficulty: intent.difficulty,
        rules: {
          winCondition: design.systems.winCondition,
          loseCondition:
            genre === "horror" || genre === "survival"
              ? "Health reaches zero"
              : "Abandon the expedition",
          timeLimitSec:
            intent.timeLimitSec ??
            (genre === "horror" && intent.difficulty === "hard" ? 240 : null),
        },
        player: {
          ...basePlayer,
          ammo: genre === "dungeon" ? basePlayer.ammo : 0,
          maxAmmo: genre === "dungeon" ? basePlayer.maxAmmo : 0,
        },
        objectives,
        exploration: {
          interactRadius: 2.1,
          sprintMultiplier: intent.difficulty === "hard" ? 1.35 : 1.55,
          jumpForce: 5.5,
        },
        combat:
          genre === "dungeon"
            ? {
                fireCooldownSec: 0.35,
                reloadSec: 1.6,
                damagePerShot: 22,
                spread: 0.05,
                autoReload: true,
              }
            : undefined,
        scoring: {
          points: 0,
          collectBonus: 150,
          checkpointBonus: 0,
          lapBonus: 0,
          killBonus: genre === "dungeon" ? 80 : 0,
          timeBonusPerSecond: 1,
        },
        narrative: {
          ...narrative,
          intro: `${design.pitch} (prompt: ${truncate(prompt, 80)})`,
        },
        features: featureFlags(
          design.systems.controlScheme === "fps" ? "fps" : "walk",
          intent,
        ),
      };
    }
  }
}

function statsForDifficulty(
  difficulty: GameRuntimeSpec["difficulty"],
  genre: GenreKind,
): GameRuntimeSpec["player"] {
  const combatHeavy = genre === "shooter" || genre === "dungeon";
  switch (difficulty) {
    case "easy":
      return {
        health: 140,
        maxHealth: 140,
        stamina: 100,
        maxStamina: 100,
        ammo: combatHeavy ? 48 : 0,
        maxAmmo: combatHeavy ? 48 : 0,
        lives: 5,
        armor: 0.1,
      };
    case "hard":
      return {
        health: 70,
        maxHealth: 70,
        stamina: 70,
        maxStamina: 70,
        ammo: combatHeavy ? 18 : 0,
        maxAmmo: combatHeavy ? 24 : 0,
        lives: 1,
        armor: 0,
      };
    case "normal":
      return {
        health: 100,
        maxHealth: 100,
        stamina: 100,
        maxStamina: 100,
        ammo: combatHeavy ? 30 : 0,
        maxAmmo: combatHeavy ? 30 : 0,
        lives: 3,
        armor: 0.05,
      };
    default: {
      const _never: never = difficulty;
      return _never;
    }
  }
}

function featureFlags(
  scheme: GameRuntimeSpec["controlScheme"],
  intent: ReturnType<typeof parsePromptIntent>,
): GameRuntimeSpec["features"] {
  return {
    handbrake: scheme === "drive",
    boost: scheme === "drive" || intent.wantsBoost || scheme === "fly",
    jump: scheme === "walk" || scheme === "fps" || scheme === "fly",
    sprint: scheme === "walk" || scheme === "fps" || scheme === "twin_stick",
    fire: scheme === "fps" || scheme === "twin_stick" || scheme === "fly",
    reload: scheme === "fps",
    aim: scheme === "fps" || scheme === "twin_stick",
    crouch: scheme === "fps" || scheme === "fly",
    interact: scheme === "walk" || scheme === "fps" || scheme === "twin_stick",
    checkpoints: scheme === "drive",
    lives: true,
    staminaDrain: scheme === "walk" || scheme === "fps",
  };
}

function failTextFor(genre: GenreKind): string {
  switch (genre) {
    case "racing":
      return "Race over — the ghost lap got away.";
    case "shooter":
      return "Downed. The station falls quiet.";
    case "horror":
      return "The mist closes in. You did not make it.";
    default:
      return "Expedition failed. Try a different approach.";
  }
}

function summarizeScaffold(runtime: GameRuntimeSpec): string {
  const objs = runtime.objectives.map((o) => o.label).join("; ");
  return (
    `${runtime.genre}/${runtime.controlScheme} · ${runtime.difficulty} · ` +
    `HP ${runtime.player.health} · objectives: ${objs}`
  );
}

function truncate(text: string, n: number): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}
