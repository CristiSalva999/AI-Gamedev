import { describe, expect, it } from "vitest";
import { buildPrefab, prefabForBrief } from "@ai-gamedev/shared";
import { deriveSpec } from "../src/services/assetGenerator.js";
import { createDefaultContext } from "@ai-gamedev/shared";
import { deriveTheme, planLevelPlacements } from "../src/pipeline/heuristics.js";

describe("prefabForBrief", () => {
  it("maps forest ruin briefs to compound prefabs", () => {
    expect(prefabForBrief("broken stone archway")).toBe("stone_arch");
    expect(prefabForBrief("gnarled hollow tree")).toBe("hollow_tree");
    expect(prefabForBrief("ancient well")).toBe("ancient_well");
    expect(prefabForBrief("toppled statue")).toBe("statue");
    expect(prefabForBrief("glowing moss patches")).toBe("moss_patch");
    expect(prefabForBrief("wooden supply crate")).toBe("supply_crate");
    expect(prefabForBrief("pine tree")).toBe("pine_tree");
  });
});

describe("buildPrefab / deriveSpec", () => {
  it("emits multi-part specs for landmark briefs", () => {
    const ctx = createDefaultContext();
    const arch = deriveSpec("broken stone archway", ctx);
    expect(arch.prefab).toBe("stone_arch");
    expect(arch.parts?.length).toBeGreaterThanOrEqual(3);

    const tree = buildPrefab("tree");
    expect(tree.parts.length).toBeGreaterThanOrEqual(2);
    expect(tree.size.y).toBeGreaterThan(2);
  });
});

describe("planLevelPlacements", () => {
  it("builds an explorable forest ruins layout", () => {
    const theme = deriveTheme("Create a forest exploration game with ruins");
    expect(theme.layout).toBe("forest_ruins");
    expect(theme.environment.worldRadius).toBeGreaterThan(15);

    const placements = planLevelPlacements(
      theme,
      theme.defaultAssets,
      new Set(["ancient well", "wooden supply crate"]),
    );
    expect(placements.length).toBeGreaterThan(12);
    expect(placements.some((p) => p.role === "path")).toBe(true);
    expect(placements.some((p) => /tree/i.test(p.brief))).toBe(true);
    expect(placements.some((p) => p.interactive)).toBe(true);
  });
});
