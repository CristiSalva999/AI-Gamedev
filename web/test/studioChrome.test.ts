import { describe, expect, it } from "vitest";
import type { GameBlueprint } from "@ai-gamedev/shared";
import {
  inspectorStats,
  primaryObjectiveLabel,
  steerSuggestionsFor,
} from "../src/lib/studioChrome.js";

function stubBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
  return {
    gameTitle: "dwarvy archery",
    gameGenre: "shooter",
    visualStyle: "cinematic",
    colorPalette: ["#111"],
    pitch: "A hunt",
    environment: {
      lighting: "dusk",
      atmosphere: "yard",
      fog: false,
      groundColor: "#333",
      skyColor: "#669",
      worldRadius: 20,
    },
    entities: [
      {
        id: "e1",
        name: "Dwarf",
        spec: {
          shape: "cylinder",
          color: "#c45",
          size: { x: 1, y: 1, z: 1 },
          roughness: 0.5,
          metalness: 0.1,
        },
        position: { x: 0, y: 0, z: 0 },
        behavior: "static",
        interactive: false,
        role: "enemy",
      },
    ],
    player: {
      color: "#3498db",
      speed: 7,
      spawn: { x: 0, y: 1, z: 4 },
      animations: {
        idle: { id: "i", name: "idle", duration: 1, tracks: [] },
        walk: { id: "w", name: "walk", duration: 1, tracks: [] },
      },
    },
    mechanics: [],
    scripts: {},
    animations: {},
    controls: {
      scheme: "fps",
      label: "Shooter",
      bindings: [],
      hudLine: "WASD",
    },
    runtime: {
      genre: "shooter",
      controlScheme: "fps",
      difficulty: "normal",
      rules: { winCondition: "win", loseCondition: "lose", timeLimitSec: null },
      player: {
        health: 100,
        maxHealth: 100,
        stamina: 100,
        maxStamina: 100,
        ammo: 30,
        maxAmmo: 30,
        lives: 1,
      },
      objectives: [
        {
          id: "obj_eliminate",
          label: "Shoot 6 dwarfs",
          type: "eliminate",
          target: 6,
          progress: 0,
        },
        {
          id: "obj_orbs",
          label: "Secure 5 energy orbs",
          type: "collect",
          target: 5,
          progress: 0,
          optional: true,
        },
      ],
      scoring: {
        points: 0,
        collectBonus: 0,
        checkpointBonus: 0,
        lapBonus: 0,
        killBonus: 100,
        timeBonusPerSecond: 0,
      },
      narrative: {
        intro: "",
        objectivePing: "",
        winText: "",
        loseText: "",
      },
      features: {
        handbrake: false,
        boost: false,
        jump: false,
        sprint: true,
        fire: true,
        reload: true,
        aim: true,
        crouch: true,
        interact: false,
        checkpoints: false,
        lives: false,
        staminaDrain: false,
      },
    },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("studioChrome", () => {
  it("picks the required objective for HUD labels", () => {
    expect(primaryObjectiveLabel(stubBlueprint())).toBe("Shoot 6 dwarfs");
  });

  it("builds inspector stats from the blueprint", () => {
    const stats = inspectorStats(stubBlueprint());
    expect(stats?.enemies).toBe(1);
    expect(stats?.scheme).toBe("fps");
    expect(stats?.objective).toBe("Shoot 6 dwarfs");
  });

  it("returns shooter-focused steer suggestions", () => {
    const chips = steerSuggestionsFor(stubBlueprint());
    expect(chips.some((c) => /shoot dwarfs/i.test(c))).toBe(true);
  });
});
