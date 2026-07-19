import { describe, expect, it } from "vitest";
import { mockCompletion } from "../src/services/mockLlm.js";

describe("mockCompletion", () => {
  it("returns Blender python for model generation", () => {
    const out = mockCompletion('brief "wooden crate"', "modelGeneration");
    expect(out).toContain("import bpy");
    expect(out).toContain("export_scene.gltf");
  });

  it("returns parseable JSON for world building", () => {
    const out = mockCompletion('LOCATION: "Forgotten Grove"', "worldBuilding");
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out)).toHaveProperty("keyAssets");
  });

  it("returns TypeScript for code generation", () => {
    const out = mockCompletion('TASK: "rotate the cube"', "codeGeneration");
    expect(out).toContain("import * as THREE");
    expect(out).toContain("export function");
  });

  it("infers the task from the prompt when no hint is given", () => {
    const out = mockCompletion("Generate dialogue for a merchant");
    expect(out.length).toBeGreaterThan(0);
    expect(out).not.toContain("import bpy");
  });
});
