import { describe, expect, it } from "vitest";
import type { BuildEvent, BuildStage, GameBlueprint } from "@ai-gamedev/shared";
import { runBuild, runSteer } from "../src/pipeline/pipeline.js";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { LocalMockLLMClient } from "./support/fakes.js";

function deps() {
  const llm = new LocalMockLLMClient();
  return { llm, assetGenerator: new MockBlenderAssetGenerator(llm) };
}

async function collect(gen: AsyncGenerator<BuildEvent>): Promise<BuildEvent[]> {
  const events: BuildEvent[] = [];
  for await (const event of gen) events.push(event);
  return events;
}

function lastBlueprint(events: BuildEvent[]): GameBlueprint {
  const done = [...events].reverse().find((e) => e.type === "done");
  if (!done || done.type !== "done") throw new Error("no done event");
  return done.blueprint;
}

describe("runBuild", () => {
  it("runs every stage and produces a playable blueprint", async () => {
    const events = await collect(
      runBuild("create a forest exploration game with ruins", deps(), {
        delayMs: 0,
      }),
    );

    const stages = new Set<BuildStage>(
      events.filter((e) => e.type === "stage-start").map((e) => e.stage),
    );
    for (const stage of ["design", "world", "assets", "scripts", "animations", "package"] as const) {
      expect(stages.has(stage), stage).toBe(true);
    }

    const blueprint = lastBlueprint(events);
    expect(blueprint.entities.length).toBeGreaterThan(12);
    expect(blueprint.scripts["gameplay.ts"]).toBeTruthy();
    expect(blueprint.player.speed).toBeGreaterThan(0);
    expect(Object.keys(blueprint.animations).length).toBeGreaterThan(0);
    expect(blueprint.player.animations.idle).toBeTruthy();
    expect(blueprint.player.animations.walk).toBeTruthy();
    // Forest theme -> daylight with a larger explorable ground.
    expect(blueprint.environment.lighting).toBe("day");
    expect(blueprint.environment.worldRadius).toBeGreaterThan(15);
    expect(blueprint.environment.terrain?.kind).toBe("rolling");
    expect(blueprint.design?.fidelity).toBe("cinematic");
    expect(blueprint.design?.systems.controlScheme).toBe("walk");
    expect(blueprint.controls?.scheme).toBe("walk");
    expect(blueprint.controls?.bindings.some((b) => b.action === "interact")).toBe(true);
    expect(blueprint.runtime?.objectives.length).toBeGreaterThan(0);
    expect(blueprint.runtime?.features.interact).toBe(true);
    expect(blueprint.scripts["runtime.json"]).toBeTruthy();
    expect(blueprint.scripts["gameplay.ts"]).toContain("createInitialState");
    expect(blueprint.worldRecipe?.zones.length).toBeGreaterThan(0);
    expect(blueprint.visualStyle.toLowerCase()).not.toContain("low-poly");
    expect(blueprint.entities.some((e) => e.spec.prefab === "stone_arch")).toBe(true);
    expect(blueprint.entities.some((e) => e.spec.parts && e.spec.parts.length > 1)).toBe(true);
    expect(blueprint.entities.some((e) => e.interactive)).toBe(true);
    expect(blueprint.mechanics).toContain("collect");
  });

  it("builds an arcade racing vertical slice from a car prompt", async () => {
    const events = await collect(
      runBuild("genera un gioco di macchine arcade su un circuito", deps(), {
        delayMs: 0,
      }),
    );
    const blueprint = lastBlueprint(events);
    expect(blueprint.design?.genre).toBe("racing");
    expect(blueprint.player.avatar).toBe("car");
    expect(blueprint.controls?.scheme).toBe("drive");
    expect(blueprint.controls?.bindings.some((b) => b.action === "handbrake")).toBe(true);
    expect(blueprint.controls?.bindings.some((b) => b.action === "accelerate")).toBe(true);
    expect(blueprint.runtime?.racing?.laps).toBeGreaterThanOrEqual(3);
    expect(blueprint.runtime?.features.handbrake).toBe(true);
    expect(blueprint.scripts["gameplay.ts"]).toContain("onCheckpoint");
    expect(blueprint.environment.terrain?.kind).toBe("track_bowl");
    expect(blueprint.entities.some((e) => e.spec.prefab === "track_checkpoint")).toBe(true);
    expect(blueprint.entities.some((e) => e.spec.prefab === "track_barrier")).toBe(true);
    expect(blueprint.mechanics).toContain("drive");
  });

  it("clarifies & decomposes the request in a plan stage before building", async () => {
    const events = await collect(
      runBuild('Create a survival game called "Meadow Days" with seeds drifting on the wind', deps(), {
        delayMs: 0,
      }),
    );

    // The plan stage runs first.
    const stageStarts = events.filter((e) => e.type === "stage-start");
    expect(stageStarts[0]?.type === "stage-start" && stageStarts[0].stage).toBe("plan");

    const blueprint = lastBlueprint(events);
    // Incidental "drifting" must not turn a survival request into racing.
    expect(blueprint.plan?.genre).toBe("survival");
    expect(blueprint.design?.genre).toBe("survival");
    expect(blueprint.plan?.subRequests.length).toBeGreaterThan(1);
    expect(blueprint.scripts["plan.json"]).toBeTruthy();
  });

  it("emits incremental asset sneak peeks and a build artifact", async () => {
    const events = await collect(runBuild("make a dungeon game", deps(), { delayMs: 0 }));

    const assetPeeks = events.filter(
      (e) => e.type === "sneak-peek" && e.stage === "assets",
    );
    expect(assetPeeks.length).toBeGreaterThan(1);

    const artifact = events.find((e) => e.type === "artifact");
    expect(artifact?.type).toBe("artifact");
    if (artifact?.type === "artifact") {
      expect(artifact.manifest.branch).toMatch(/^game\//);
      expect(artifact.manifest.entityCount).toBeGreaterThan(0);
      expect(artifact.manifest.downloadUrl).toContain("/api/artifacts/");
      expect(artifact.manifest.packageFormat).toBe("zip+html");
      expect(artifact.manifest.animationCount).toBeGreaterThan(0);
    }
  });
});

describe("runSteer", () => {
  async function seedBlueprint(): Promise<GameBlueprint> {
    const events = await collect(runBuild("make a forest game", deps(), { delayMs: 0 }));
    return lastBlueprint(events);
  }

  it("relights the scene to night", async () => {
    const blueprint = await seedBlueprint();
    expect(blueprint.environment.lighting).toBe("day");

    const events = await collect(runSteer("make it night", blueprint, deps()));
    const updated = lastBlueprint(events);
    expect(updated.environment.lighting).toBe("night");
    expect(updated.environment.fog).toBe(true);
  });

  it("adds requested objects to the scene", async () => {
    const blueprint = await seedBlueprint();
    const before = blueprint.entities.length;

    const events = await collect(runSteer("add more towers", blueprint, deps()));
    const updated = lastBlueprint(events);
    expect(updated.entities.length).toBe(before + 3);
  });

  it("adjusts player speed", async () => {
    const blueprint = await seedBlueprint();
    const before = blueprint.player.speed;

    const events = await collect(runSteer("make the player faster", blueprint, deps()));
    const updated = lastBlueprint(events);
    expect(updated.player.speed).toBeGreaterThan(before);
  });
});
