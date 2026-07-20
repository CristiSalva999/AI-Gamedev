import { describe, expect, it } from "vitest";
import {
  composeSetupPrompt,
  prefabForBrief,
  type GameBlueprint,
} from "@ai-gamedev/shared";
import { huntPositionsNearSpawn, isEnemyBrief } from "../src/pipeline/heuristics.js";
import { runSteer } from "../src/pipeline/pipeline.js";
import { LocalMockLLMClient } from "./support/fakes.js";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { pickGenrePack } from "../src/pipeline/genrePacks.js";
import { buildScaffold } from "../src/pipeline/scaffold.js";

describe("archery dwarf hunt", () => {
  it("maps dwarf briefs to the dwarf prefab and enemy role", () => {
    expect(prefabForBrief("dwarf raider")).toBe("dwarf");
    expect(isEnemyBrief("dwarf scout")).toBe(true);
    expect(isEnemyBrief("wooden supply crate")).toBe(false);
  });

  it("steers an existing build into a shootable dwarf hunt", async () => {
    const prompt = composeSetupPrompt({
      title: "dwarvy archery",
      genre: "shooter",
      setting: "dwarven archery training grounds",
      timeOfDay: "day",
      goal: "Hit targets",
      storyline: "Practice on the range",
    });
    const pack = pickGenrePack(prompt);
    const design = pack.design("dwarvy archery", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);
    const blueprint: GameBlueprint = {
      gameTitle: "dwarvy archery",
      gameGenre: "shooter",
      visualStyle: design.visualStyle,
      colorPalette: design.palette,
      pitch: design.pitch,
      environment: {
        lighting: "day",
        atmosphere: "yard",
        fog: false,
        groundColor: "#3d4a32",
        skyColor: "#87b7d9",
        worldRadius: 22,
      },
      entities: [],
      player: {
        color: "#3498db",
        speed: 6,
        spawn: { x: 0, y: 0.9, z: 8 },
        animations: {
          idle: { id: "i", name: "idle", duration: 1, tracks: [] },
          walk: { id: "w", name: "walk", duration: 1, tracks: [] },
        },
      },
      mechanics: [...pack.mechanics],
      scripts: {},
      animations: {},
      design,
      runtime: scaffold.runtime,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const deps = {
      llm: new LocalMockLLMClient(),
      assetGenerator: new MockBlenderAssetGenerator(new LocalMockLLMClient()),
    };
    let done: GameBlueprint | null = null;
    for await (const ev of runSteer("make me shoot dwarfs with archery", blueprint, deps)) {
      if (ev.type === "done") done = ev.blueprint;
    }
    expect(done).toBeTruthy();
    const enemies = done!.entities.filter((e) => e.role === "enemy");
    expect(enemies.length).toBeGreaterThanOrEqual(3);
    expect(done!.runtime?.objectives.some((o) => o.type === "eliminate")).toBe(true);
    expect(done!.runtime?.objectives.some((o) => o.type === "collect")).toBe(false);
    expect(done!.runtime?.objectives.some((o) => /energy orb/i.test(o.label))).toBe(false);
    expect(done!.controls?.scheme).toBe("fps");
    expect(done!.controls?.bindings.some((b) => b.action === "turnLeft")).toBe(true);

    const spawn = done!.player.spawn;
    const worldR = done!.environment.worldRadius ?? 22;
    for (const enemy of enemies) {
      const dist = Math.hypot(enemy.position.x - spawn.x, enemy.position.z - spawn.z);
      expect(dist).toBeGreaterThan(3);
      expect(dist).toBeLessThan(worldR * 0.75);
    }
  });

  it("matches fix-the-archery phrasing as a hunt steer", async () => {
    const prompt = composeSetupPrompt({
      title: "dwarvy archery",
      genre: "shooter",
      setting: "dwarven archery training grounds",
      timeOfDay: "day",
      goal: "Hit targets",
      storyline: "Practice on the range",
    });
    const pack = pickGenrePack(prompt);
    const design = pack.design("dwarvy archery", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);
    const blueprint: GameBlueprint = {
      gameTitle: "dwarvy archery",
      gameGenre: "shooter",
      visualStyle: design.visualStyle,
      colorPalette: design.palette,
      pitch: design.pitch,
      environment: {
        lighting: "day",
        atmosphere: "yard",
        fog: false,
        groundColor: "#3d4a32",
        skyColor: "#87b7d9",
        worldRadius: 22,
      },
      entities: [
        {
          id: "orb1",
          name: "Energy Orb",
          spec: {
            shape: "sphere",
            color: "#0ff",
            size: { x: 0.5, y: 0.5, z: 0.5 },
            roughness: 0.4,
            metalness: 0.2,
          },
          position: { x: 2, y: 0, z: 2 },
          behavior: "pulse",
          interactive: true,
          role: "loot",
          interactHint: "Collect energy orb",
        },
      ],
      player: {
        color: "#3498db",
        speed: 6,
        spawn: { x: 0, y: 0.9, z: 8 },
        animations: {
          idle: { id: "i", name: "idle", duration: 1, tracks: [] },
          walk: { id: "w", name: "walk", duration: 1, tracks: [] },
        },
      },
      mechanics: [...pack.mechanics],
      scripts: {},
      animations: {},
      design,
      runtime: scaffold.runtime,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const deps = {
      llm: new LocalMockLLMClient(),
      assetGenerator: new MockBlenderAssetGenerator(new LocalMockLLMClient()),
    };
    let done: GameBlueprint | null = null;
    for await (const ev of runSteer(
      "fix the game as it's not an archery game where i can shoot dwarfs",
      blueprint,
      deps,
    )) {
      if (ev.type === "done") done = ev.blueprint;
    }
    expect(done).toBeTruthy();
    expect(done!.entities.filter((e) => e.role === "enemy").length).toBeGreaterThanOrEqual(3);
    const orb = done!.entities.find((e) => /orb/i.test(e.name));
    expect(orb?.interactive).toBe(false);
    expect(done!.runtime?.objectives.every((o) => o.type !== "collect")).toBe(true);
  });
});
