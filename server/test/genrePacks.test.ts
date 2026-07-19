import { describe, expect, it } from "vitest";
import { inferGenreKind } from "@ai-gamedev/shared";
import { pickGenrePack } from "../src/pipeline/genrePacks.js";
import { planLevelPlacements, playerFor } from "../src/pipeline/heuristics.js";

describe("genre packs", () => {
  it("infers racing from italian/english arcade prompts", () => {
    expect(inferGenreKind("genera un gioco di macchine arcade")).toBe("racing");
    expect(inferGenreKind("Build an arcade racing game")).toBe("racing");
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
