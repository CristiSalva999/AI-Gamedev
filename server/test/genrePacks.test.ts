import { describe, expect, it } from "vitest";
import { inferGenreKind } from "@ai-gamedev/shared";
import { pickGenrePack } from "../src/pipeline/genrePacks.js";
import { planLevelPlacements, playerFor } from "../src/pipeline/heuristics.js";

describe("genre packs", () => {
  it("infers racing from italian/english arcade prompts", () => {
    expect(inferGenreKind("genera un gioco di macchine arcade")).toBe("racing");
    expect(inferGenreKind("Build an arcade racing game")).toBe("racing");
  });

  it("honors an explicitly declared genre over incidental keywords", () => {
    // "drifting" (pollen/seeds/clouds) must not flip a survival game to racing.
    const prompt =
      'Create a survival game called "Meadow Days" with pollen drifting in ' +
      "sunbeams, dandelion seeds drifting on the wind, and soft clouds drifting by. " +
      "Objective: explore the meadow and survive.";
    expect(inferGenreKind(prompt)).toBe("survival");
  });

  it("declares survival/exploration/shooter game types", () => {
    expect(inferGenreKind("make a cozy survival game about a pig")).toBe("survival");
    expect(inferGenreKind("Create a forest exploration game with ruins")).toBe("exploration");
    expect(inferGenreKind("build a neon fps shooter game")).toBe("shooter");
  });

  it("falls back to weighted scoring when no genre is declared", () => {
    // Many survival signals, only an incidental 'drifting' → survival, not racing.
    expect(
      inferGenreKind("a world where you scavenge, manage hunger and thirst, and survive the night while leaves keep drifting"),
    ).toBe("survival");
  });

  it("builds a cinematic forest exploration pack", () => {
    const pack = pickGenrePack("Create a forest exploration game with ruins");
    expect(pack.kind).toBe("exploration");
    expect(pack.theme.visualStyle.toLowerCase()).not.toContain("low-poly");
    const design = pack.design("Forest", "ruins", "cinematic");
    expect(design.fidelity).toBe("cinematic");
    expect(design.systems.controlScheme).toBe("walk");
    const world = pack.world("Forest", "cinematic");
    expect(world.terrain.kind).toBe("rolling");
    expect(world.zones.length).toBeGreaterThan(1);
  });

  it("builds a driveable race track layout", () => {
    const pack = pickGenrePack("arcade car racing circuit");
    expect(pack.kind).toBe("racing");
    const player = playerFor(pack.theme);
    expect(player.avatar).toBe("car");
    expect(player.speed).toBeGreaterThan(10);

    const placements = planLevelPlacements(
      pack.theme,
      pack.theme.defaultAssets,
      new Set(["track checkpoint"]),
      { maxAmbient: 40, recipe: pack.world("Race", "cinematic") },
    );
    expect(placements.some((p) => /checkpoint/i.test(p.brief))).toBe(true);
    expect(placements.some((p) => /barrier/i.test(p.brief))).toBe(true);
    expect(placements.length).toBeGreaterThan(20);
  });
});
