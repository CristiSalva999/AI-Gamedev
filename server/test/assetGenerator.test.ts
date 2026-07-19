import { describe, expect, it } from "vitest";
import { createDefaultContext } from "@ai-gamedev/shared";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { FakeLLMClient } from "./support/fakes.js";

const context = createDefaultContext();

function generator() {
  return new MockBlenderAssetGenerator(new FakeLLMClient());
}

describe("MockBlenderAssetGenerator", () => {
  it("maps brief keywords to primitive shapes", async () => {
    const cases: Array<[string, string]> = [
      ["ancient stone pillar", "cylinder"],
      ["glowing orb", "sphere"],
      ["wooden crate", "box"],
      ["warning cone", "cone"],
      ["magic ring", "torus"],
    ];
    for (const [brief, shape] of cases) {
      const { asset } = await generator().generate(brief, context);
      expect(asset.spec.shape, brief).toBe(shape);
    }
  });

  it("derives material color from keywords", async () => {
    const { asset } = await generator().generate("golden chest", context);
    expect(asset.spec.color).toBe("#ffd700");
    expect(asset.spec.metalness).toBeGreaterThan(0.5);
  });

  it("scales up for size adjectives", async () => {
    const { asset } = await generator().generate("giant boulder", context);
    expect(asset.spec.size.x).toBe(2);
  });

  it("is deterministic for the same brief", async () => {
    const a = await generator().generate("mystic gem", context);
    const b = await generator().generate("mystic gem", context);
    expect(a.asset.spec).toEqual(b.asset.spec);
  });
});
