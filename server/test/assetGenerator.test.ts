import { describe, expect, it } from "vitest";
import { createDefaultContext } from "@ai-gamedev/shared";
import {
  blenderCandidatePaths,
  buildAssetBlenderScript,
  deriveSpec,
  MockBlenderAssetGenerator,
} from "../src/services/assetGenerator.js";
import { FakeLLMClient } from "./support/fakes.js";

const context = createDefaultContext();

function generator() {
  return new MockBlenderAssetGenerator(new FakeLLMClient());
}

describe("MockBlenderAssetGenerator", () => {
  it("maps brief keywords to primitive shapes", async () => {
    const cases: Array<[string, string]> = [
      ["glowing orb", "sphere"],
      ["warning cone", "cone"],
      ["magic ring", "torus"],
    ];
    for (const [brief, shape] of cases) {
      const { asset } = await generator().generate(brief, context);
      expect(asset.spec.shape, brief).toBe(shape);
    }
  });

  it("maps set pieces to compound prefabs", async () => {
    const { asset } = await generator().generate("ancient stone pillar", context);
    expect(asset.spec.prefab).toBe("stone_pillar");
    expect(asset.spec.parts?.length).toBeGreaterThan(1);

    const crate = await generator().generate("wooden crate", context);
    expect(crate.asset.spec.prefab).toBe("supply_crate");
  });

  it("derives material color from keywords", async () => {
    const { asset } = await generator().generate("golden chest", context);
    expect(asset.spec.color).toBe("#ffd700");
    expect(asset.spec.metalness).toBeGreaterThan(0.5);
  });

  it("scales up for size adjectives", async () => {
    const base = await generator().generate("boulder", context);
    const { asset } = await generator().generate("giant boulder", context);
    expect(asset.spec.size.x).toBeCloseTo(base.asset.spec.size.x * 2);
  });

  it("is deterministic for the same brief", async () => {
    const a = await generator().generate("mystic gem", context);
    const b = await generator().generate("mystic gem", context);
    expect(a.asset.spec).toEqual(b.asset.spec);
  });
});

describe("blenderCandidatePaths", () => {
  it("always includes the configured binary first", async () => {
    const paths = await blenderCandidatePaths("C:\\Tools\\blender.exe", {});
    expect(paths[0]).toBe("C:\\Tools\\blender.exe");
  });

  it("probes Program Files Blender Foundation on Windows", async () => {
    if (process.platform !== "win32") {
      // Function still returns the configured bin on non-Windows.
      const paths = await blenderCandidatePaths("blender", {
        ProgramFiles: "C:\\Program Files",
      });
      expect(paths).toEqual(["blender"]);
      return;
    }
    const paths = await blenderCandidatePaths("blender", {
      ProgramFiles: process.env.ProgramFiles ?? "C:\\Program Files",
    });
    expect(paths[0]).toBe("blender");
    // At least the Steam/flat fallback path is considered.
    expect(paths.some((p) => /Blender\\blender\.exe$/i.test(p))).toBe(true);
  });
});

describe("buildAssetBlenderScript", () => {
  it("builds a bpy script that constructs every part and exports a GLB", () => {
    const spec = deriveSpec("ancient stone pillar", context);
    const glbPath = "/tmp/out/pillar.glb";
    const script = buildAssetBlenderScript(spec, glbPath, "ancient stone pillar");

    expect(script).toContain("import bpy");
    // One primitive add per mesh part.
    const adds = script.match(/bpy\.ops\.mesh\.primitive_/g) ?? [];
    expect(adds.length).toBe(spec.parts?.length);
    // Exports to our exact path/format (never the author's path).
    expect(script).toContain(`export_scene.gltf(filepath=r"${glbPath}", export_format='GLB')`);
  });

  it("always maps a single-part spec to a primitive and export", () => {
    const spec = deriveSpec("glowing orb", context);
    const script = buildAssetBlenderScript(spec, "/tmp/orb.glb");
    expect(script).toMatch(/primitive_(uv_sphere|cube|cylinder|cone|torus)_add/);
    expect(script).toContain("export_format='GLB'");
  });
});
