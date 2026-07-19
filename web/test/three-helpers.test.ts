import { describe, expect, it } from "vitest";
import type { AssetSpec } from "@ai-gamedev/shared";
import { geometryParams } from "../src/lib/three-helpers.js";

function spec(overrides: Partial<AssetSpec>): AssetSpec {
  return {
    shape: "box",
    color: "#ffffff",
    size: { x: 1, y: 1, z: 1 },
    roughness: 0.7,
    metalness: 0.1,
    ...overrides,
  };
}

describe("geometryParams", () => {
  it("maps a box to its three dimensions", () => {
    expect(geometryParams(spec({ shape: "box", size: { x: 2, y: 3, z: 4 } }))).toEqual({
      type: "box",
      args: [2, 3, 4],
    });
  });

  it("produces radius/segment args for a sphere", () => {
    const params = geometryParams(spec({ shape: "sphere" }));
    expect(params.type).toBe("sphere");
    expect(params.args[0]).toBeCloseTo(0.6);
    expect(params.args).toHaveLength(3);
  });

  it("handles every primitive shape", () => {
    for (const shape of ["box", "sphere", "cylinder", "cone", "torus"] as const) {
      expect(geometryParams(spec({ shape })).type).toBe(shape);
    }
  });
});
