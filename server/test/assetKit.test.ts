import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  assetKitRoot,
  kitStats,
  loadAssetKitManifest,
  matchAssetKit,
  scoreKitEntry,
} from "../src/services/assetKit.js";
import { createDefaultContext } from "@ai-gamedev/shared";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { FakeLLMClient } from "./support/fakes.js";

describe("asset kit matching", () => {
  it("loads the vendored Kenney CC0 manifest", async () => {
    const manifest = await loadAssetKitManifest();
    expect(manifest.entries.length).toBeGreaterThan(20);
    const stats = await kitStats();
    expect(stats.entries).toBe(manifest.entries.length);
    expect(assetKitRoot()).toMatch(/asset-kit$/);
  });

  it("prefers specific tags (pine tree over generic tree)", async () => {
    const pine = await matchAssetKit("tall pine tree in the grove");
    expect(pine?.entry.id).toBe("tree_pine");
    const arch = await matchAssetKit("broken stone archway over the path");
    expect(arch?.entry.id).toMatch(/arch/);
    const target = await matchAssetKit("archery target on the range");
    expect(target?.entry.id).toBe("banner_red");
  });

  it("scores longer tag hits higher", () => {
    const entry = { id: "x", file: "glb/x.glb", tags: ["tree", "pine tree"] };
    expect(scoreKitEntry("pine tree", entry)).toBeGreaterThan(scoreKitEntry("tree", entry));
  });

  it("materializes kit assets from the mock generator", async () => {
    const gen = new MockBlenderAssetGenerator(new FakeLLMClient());
    const { asset, source } = await gen.generate(
      "ancient well by the ruins",
      createDefaultContext(),
    );
    expect(source).toBe("kit");
    expect(asset.kitId).toBe("fountain");
    expect(asset.modelUrl).toBe("/api/asset-kit/fountain.glb");
    await access(`${assetKitRoot()}/glb/fountain.glb`);
  });
});
