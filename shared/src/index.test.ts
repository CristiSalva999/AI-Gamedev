import { describe, expect, it } from "vitest";
import { isGameGenre, slugify, summarizeGame } from "./index.js";

describe("isGameGenre", () => {
  it("accepts known genres", () => {
    expect(isGameGenre("rpg")).toBe(true);
  });

  it("rejects unknown genres", () => {
    expect(isGameGenre("mmo")).toBe(false);
  });
});

describe("slugify", () => {
  it("creates url-safe slugs", () => {
    expect(slugify("  Epic Quest: The Return!  ")).toBe("epic-quest-the-return");
  });
});

describe("summarizeGame", () => {
  it("builds a readable pitch", () => {
    expect(
      summarizeGame({ title: "Star Drift", genre: "shooter", storyline: "Save the galaxy." }),
    ).toBe("Star Drift — a Shooter game: Save the galaxy.");
  });
});
