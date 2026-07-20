import { describe, expect, it } from "vitest";
import { composeSetupPrompt, heuristicPlan, prefabForBrief } from "@ai-gamedev/shared";
import { adaptPackToPlan } from "../src/pipeline/adaptPack.js";
import { packForKind } from "../src/pipeline/genrePacks.js";

describe("adaptPackToPlan", () => {
  it("keeps shooter systems but swaps sci-fi props for a dwarven archery setting", () => {
    const prompt = composeSetupPrompt({
      title: "dwarvy archery",
      genre: "shooter",
      setting: "dwarven archery training grounds in the mountains",
      timeOfDay: "day",
      goal: "Hit every target before dusk",
      storyline: "A lone dwarven marksman proves their skill against straw dummies",
    });
    const plan = heuristicPlan(prompt);
    expect(plan.genre).toBe("shooter");

    const adapted = adaptPackToPlan(packForKind("shooter"), plan, prompt);
    expect(adapted.kind).toBe("shooter");
    expect(adapted.motif.id).toBe("archery_medieval");
    expect(adapted.theme.defaultAssets.join(" ")).toMatch(/archery target/i);
    expect(adapted.theme.defaultAssets.join(" ")).not.toMatch(/landing pad|energy orb/i);
    expect(adapted.theme.environment.lighting).toBe("day");

    const design = adapted.design("dwarvy archery", prompt, "cinematic");
    expect(design.systems.controlScheme).toBe("fps");
    expect(design.visualStyle.toLowerCase()).toMatch(/medieval|archery|timber/);
    expect(design.systems.winCondition.toLowerCase()).toMatch(/target|dusk/);

    const world = adapted.world("dwarvy archery", "cinematic");
    const landmarkText = world.zones.flatMap((z) => z.landmarks).join(" ");
    expect(landmarkText).toMatch(/dwarf|archery|hay|quiver/i);
    expect(world.interactive.join(" ")).not.toMatch(/energy orb/i);
  });

  it("does not strip racing track kits", () => {
    const prompt = 'Create a racing game called "Neon Circuit" set in a neon city during the dusk.';
    const plan = heuristicPlan(prompt);
    const adapted = adaptPackToPlan(packForKind("racing"), plan, prompt);
    expect(adapted.theme.defaultAssets.some((a) => /checkpoint|barrier/i.test(a))).toBe(true);
  });
});

describe("archery prefabs", () => {
  it("maps archery briefs to dedicated prefabs", () => {
    expect(prefabForBrief("archery target")).toBe("archery_target");
    expect(prefabForBrief("hay bale barrier")).toBe("hay_bale");
    expect(prefabForBrief("straw training dummy")).toBe("statue");
  });
});
