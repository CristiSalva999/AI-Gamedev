import { mkdtemp, readFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  controlProfileFor,
  createDefaultContext,
  createIdleClip,
  createWalkClip,
  sampleClip,
  sampleTrack,
  type GameBlueprint,
} from "@ai-gamedev/shared";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { GamePackager, buildPlayableHtml } from "../src/services/gamePackager.js";
import { GitWorkspaceService } from "../src/services/gitWorkspace.js";
import { buildGlb, writeProceduralGlb } from "../src/services/glbWriter.js";
import { FakeLLMClient } from "./support/fakes.js";

const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "aigamedev-"));
  temps.push(dir);
  return dir;
}

function sampleBlueprint(): GameBlueprint {
  return {
    gameTitle: "Forest Ruins",
    gameGenre: "Exploration adventure",
    visualStyle: "stylized low-poly nature",
    colorPalette: ["#2ecc71"],
    pitch: "Explore mossy ruins.",
    environment: {
      lighting: "day",
      atmosphere: "dappled",
      fog: false,
      groundColor: "#1e3a24",
      skyColor: "#7ec8e3",
    },
    entities: [
      {
        id: "e1",
        name: "crate",
        spec: {
          shape: "box",
          color: "#8b5a2b",
          size: { x: 1, y: 1, z: 1 },
          roughness: 0.7,
          metalness: 0.1,
        },
        position: { x: 2, y: 0, z: 0 },
        behavior: "spin",
        interactive: false,
      },
    ],
    player: {
      color: "#2ecc71",
      speed: 6,
      spawn: { x: 0, y: 0.5, z: 0 },
      animations: { idle: createIdleClip(), walk: createWalkClip() },
    },
    mechanics: ["move"],
    scripts: { "gameplay.ts": "export const speed = 6;\n" },
    animations: {},
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("glbWriter", () => {
  it("writes a valid GLB header for each primitive shape", () => {
    const shapes = ["box", "sphere", "cylinder", "cone", "torus"] as const;
    for (const shape of shapes) {
      const buf = buildGlb({
        shape,
        color: "#ff0000",
        size: { x: 1, y: 1, z: 1 },
        roughness: 0.5,
        metalness: 0.2,
      });
      expect(buf.toString("ascii", 0, 4)).toBe("glTF");
      expect(buf.readUInt32LE(4)).toBe(2);
      expect(buf.readUInt32LE(8)).toBe(buf.length);
    }
  });

  it("persists a .glb file to disk", async () => {
    const dir = await tempDir();
    const out = path.join(dir, "crate.glb");
    await writeProceduralGlb(
      {
        shape: "box",
        color: "#8b5a2b",
        size: { x: 1, y: 1, z: 1 },
        roughness: 0.7,
        metalness: 0.1,
      },
      out,
    );
    await access(out);
    const bytes = await readFile(out);
    expect(bytes.length).toBeGreaterThan(100);
  });
});

describe("GitWorkspaceService", () => {
  it("creates a game workspace with a real git branch", async () => {
    const root = await tempDir();
    const git = new GitWorkspaceService(root);
    const result = await git.createGameBranch("forest-ruins", "Forest Ruins");
    expect(result.created).toBe(true);
    expect(result.branch).toBe("game/forest-ruins");
    await access(path.join(result.workspacePath, "README.md"));
  });
});

describe("GamePackager", () => {
  it("packages a zip with play.html and returns a downloadable manifest", async () => {
    const root = await tempDir();
    const packager = new GamePackager({
      git: new GitWorkspaceService(root),
      gamesRoot: root,
    });
    const { manifest, zipPath } = await packager.package(sampleBlueprint(), {
      slug: "forest-ruins",
    });
    expect(manifest.downloadUrl).toBe("/api/artifacts/forest-ruins/download");
    expect(manifest.branchCreated).toBe(true);
    expect(manifest.packageFormat).toBe("zip+html");
    await access(zipPath);
    const zip = await readFile(zipPath);
    expect(zip[0]).toBe(0x50); // 'P' of PK zip magic
    expect(zip[1]).toBe(0x4b);
  });

  it("embeds the blueprint in a self-contained play.html", () => {
    const html = buildPlayableHtml(sampleBlueprint());
    expect(html).toContain("Forest Ruins");
    expect(html).toContain("const BP =");
    expect(html).toContain("WASD");
  });

  it("drives play.html input from blueprint.controls, not hard-coded keys", () => {
    const walk = { ...sampleBlueprint(), controls: controlProfileFor("walk") };
    const html = buildPlayableHtml(walk);
    // Runner reads the same profile shown in the HUD legend.
    expect(html).toContain("BP.controls");
    expect(html).toContain('axis("moveRight","moveLeft")');
    expect(html).toContain('KEYMAP.interact');
    // Drive blueprints get throttle/steer physics in the same runner.
    expect(html).toContain('PROFILE.scheme==="drive"');
    expect(html).toContain('axis("accelerate","brake")');
    expect(html).toContain(controlProfileFor("walk").hudLine);
  });
});

describe("animation sampling", () => {
  it("interpolates keyframe tracks", () => {
    const clip = createIdleClip();
    const mid = sampleTrack(clip.tracks[0], 1);
    expect(mid).toBeCloseTo(0.06);
    const sampled = sampleClip(clip, 1);
    expect(sampled["position.y"]).toBeCloseTo(0.06);
  });
});

describe("MockBlenderAssetGenerator with outputDir", () => {
  it("writes a procedural .glb beside the asset", async () => {
    const dir = await tempDir();
    const gen = new MockBlenderAssetGenerator(new FakeLLMClient());
    const { asset } = await gen.generate("golden chest", createDefaultContext(), {
      outputDir: dir,
    });
    expect(asset.source).toBeTruthy();
    await access(asset.source as string);
  });
});
