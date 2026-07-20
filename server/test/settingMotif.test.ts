import { describe, expect, it } from "vitest";
import {
  detectLightingFromPrompt,
  detectSettingMotif,
  extractStoryline,
} from "@ai-gamedev/shared";

describe("detectSettingMotif", () => {
  it("detects archery / dwarven grounds before generic sci-fi", () => {
    const motif = detectSettingMotif(
      "dwarvy archery",
      "dwarven archery training grounds",
      "hit every target",
    );
    expect(motif.id).toBe("archery_medieval");
    expect(motif.landmarks.some((l) => /archery target/i.test(l))).toBe(true);
  });

  it("detects forest ruins", () => {
    expect(detectSettingMotif("forest with ancient ruins").id).toBe("forest_ruins");
  });

  it("detects explicit sci-fi", () => {
    expect(detectSettingMotif("neon space station hangar").id).toBe("sci_fi");
  });
});

describe("detectLightingFromPrompt", () => {
  it("reads setup phrasing", () => {
    expect(detectLightingFromPrompt("during the day")).toBe("day");
    expect(detectLightingFromPrompt("during the night")).toBe("night");
    expect(detectLightingFromPrompt("during the dusk")).toBe("dusk");
  });
});

describe("extractStoryline", () => {
  it("pulls the storyline clause from a composed prompt", () => {
    expect(
      extractStoryline("Create a shooter game. Storyline: A lone explorer races the storm."),
    ).toMatch(/lone explorer/i);
  });
});
