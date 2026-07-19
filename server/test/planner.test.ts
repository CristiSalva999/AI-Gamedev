import { describe, expect, it } from "vitest";
import { heuristicPlan, summarizePlan } from "@ai-gamedev/shared";
import { planRequest } from "../src/pipeline/planner.js";
import { FakeLLMClient } from "./support/fakes.js";

const survivalPrompt =
  'Create a survival game called "Meadow Days" set in a cozy valley with pollen ' +
  "drifting on the wind. Objective: gather food and survive the night.";

describe("heuristicPlan", () => {
  it("clarifies the goal and decomposes request → sub-requests → tasks → subtasks", () => {
    const plan = heuristicPlan(survivalPrompt);
    expect(plan.genre).toBe("survival");
    expect(plan.title).toBe("Meadow Days");
    expect(plan.objective.toLowerCase()).toContain("gather food");
    expect(plan.goal.length).toBeGreaterThan(10);

    // Full hierarchy is present.
    expect(plan.subRequests.length).toBeGreaterThan(1);
    const everyHasTasks = plan.subRequests.every((sr) => sr.tasks.length > 0);
    expect(everyHasTasks).toBe(true);
    const someHasSubtasks = plan.subRequests.some((sr) =>
      sr.tasks.some((t) => t.subtasks.length > 0),
    );
    expect(someHasSubtasks).toBe(true);
  });

  it("summarizes the decomposition for the chat", () => {
    const summary = summarizePlan(heuristicPlan(survivalPrompt));
    expect(summary).toContain("Clarified goal:");
    expect(summary).toContain("sub-requests");
  });
});

describe("planRequest", () => {
  it("falls back to the heuristic plan when the model is unavailable (mock)", async () => {
    // FakeLLMClient returns source "mock" by default → heuristic fallback.
    const plan = await planRequest(survivalPrompt, new FakeLLMClient());
    expect(plan.source).toBe("heuristic");
    expect(plan.genre).toBe("survival");
  });

  it("uses the model's plan when a real LLM answers with JSON", async () => {
    const llmJson = JSON.stringify({
      goal: "A tense dungeon crawl to recover the crown.",
      genre: "dungeon",
      title: "Crown Depths",
      setting: "flooded catacombs",
      objective: "recover the crown",
      keyFeatures: ["combat encounters", "loot"],
      subRequests: [
        {
          title: "Concept",
          tasks: [{ title: "Set genre", subtasks: ["dungeon crawler", "combat focus"] }],
        },
      ],
    });
    const llm = new FakeLLMClient({ text: "```json\n" + llmJson + "\n```", source: "llm" });
    const plan = await planRequest("make something in dark tunnels", llm);
    expect(plan.source).toBe("llm");
    expect(plan.genre).toBe("dungeon");
    expect(plan.title).toBe("Crown Depths");
    expect(plan.subRequests[0].tasks[0].subtasks).toContain("combat focus");
  });

  it("ignores an invalid model genre and keeps a valid plan", async () => {
    const llm = new FakeLLMClient({
      text: JSON.stringify({ genre: "not-a-genre", title: "X", subRequests: [] }),
      source: "llm",
    });
    const plan = await planRequest(survivalPrompt, llm);
    // Invalid genre falls back to the heuristic-detected genre.
    expect(plan.genre).toBe("survival");
  });
});
