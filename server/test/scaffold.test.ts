import { describe, expect, it } from "vitest";
import { controlProfileFor } from "@ai-gamedev/shared";
import { pickGenrePack } from "../src/pipeline/genrePacks.js";
import { buildScaffold, parsePromptIntent } from "../src/pipeline/scaffold.js";
import { authorGameplayScript } from "../src/pipeline/scriptAuthor.js";

describe("parsePromptIntent", () => {
  it("reads laps, difficulty and collect goals from free text", () => {
    const intent = parsePromptIntent("genera un gioco di macchine arcade hard con 5 giri");
    expect(intent.difficulty).toBe("hard");
    expect(intent.laps).toBe(5);
  });
});

describe("buildScaffold", () => {
  it("prefills a complete racing runtime from the user prompt", () => {
    const prompt = "Genera un gioco di macchine arcade con 3 giri e nitro";
    const pack = pickGenrePack(prompt);
    const design = pack.design("Neon Circuit", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);

    expect(scaffold.runtime.genre).toBe("racing");
    expect(scaffold.runtime.racing?.laps).toBe(3);
    expect(scaffold.runtime.features.handbrake).toBe(true);
    expect(scaffold.runtime.features.boost).toBe(true);
    expect(scaffold.runtime.objectives.some((o) => o.type === "lap")).toBe(true);
    expect(scaffold.runtime.player.health).toBeGreaterThan(0);
    expect(scaffold.summary).toContain("racing");
  });

  it("prefills exploration collect goals from the prompt", () => {
    const prompt = "Create a forest exploration game with ruins and collect 4 relics";
    const pack = pickGenrePack(prompt);
    const design = pack.design("Forest", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);
    const collect = scaffold.runtime.objectives.find((o) => o.type === "collect");
    expect(collect?.target).toBe(4);
    expect(scaffold.runtime.features.interact).toBe(true);
  });

  it("prefills a dwarf archery hunt with eliminate objectives", () => {
    const prompt =
      'Create a shooter game called "dwarvy archery" set in dwarven archery training grounds during the day. Objective: Shoot the dwarf raiders.';
    const pack = pickGenrePack(prompt);
    expect(pack.kind).toBe("shooter");
    const design = pack.design("dwarvy archery", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);
    const eliminate = scaffold.runtime.objectives.find((o) => o.type === "eliminate");
    expect(eliminate).toBeTruthy();
    expect(eliminate!.target).toBeGreaterThanOrEqual(4);
    expect(scaffold.runtime.features.fire).toBe(true);
    expect(scaffold.runtime.rules.winCondition.toLowerCase()).toMatch(/dwarf/);
  });
});

describe("authorGameplayScript", () => {
  it("emits a complete gameplay module with rules and controls", () => {
    const prompt = "arcade racing 3 laps";
    const pack = pickGenrePack(prompt);
    const design = pack.design("Race", prompt, "cinematic");
    const scaffold = buildScaffold(prompt, pack, design);
    const controls = controlProfileFor("drive");
    const source = authorGameplayScript({
      design,
      runtime: scaffold.runtime,
      controls,
    });

    expect(source).toContain("export function createInitialState");
    expect(source).toContain("export function onCheckpoint");
    expect(source).toContain("export function onFire");
    expect(source).toContain("handbrake");
    expect(source).toContain("RULES");
    expect(source.split("\n").length).toBeGreaterThan(80);
  });
});
