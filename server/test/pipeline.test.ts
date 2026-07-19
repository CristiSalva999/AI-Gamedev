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
    for (const stage of ["design", "world", "assets", "scripts", "package"] as const) {
      expect(stages.has(stage), stage).toBe(true);
    }

    const blueprint = lastBlueprint(events);
    expect(blueprint.entities.length).toBeGreaterThan(0);
    expect(blueprint.scripts["gameplay.ts"]).toBeTruthy();
    expect(blueprint.player.speed).toBeGreaterThan(0);
    // Forest theme -> daylight.
    expect(blueprint.environment.lighting).toBe("day");
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
