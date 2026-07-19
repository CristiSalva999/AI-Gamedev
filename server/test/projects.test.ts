import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { composeSetupPrompt, type BuildEvent, type GameSetupAnswers } from "@ai-gamedev/shared";
import { createApp } from "../src/app.js";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import { ProjectStore } from "../src/services/projectStore.js";
import { InMemoryContextStore, LocalMockLLMClient } from "./support/fakes.js";

function parseSse(body: string): BuildEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.replace(/^data: /, "").trim())
    .filter(Boolean)
    .map((json) => JSON.parse(json) as BuildEvent);
}

const answers: GameSetupAnswers = {
  title: "Forest Exploration Ruins",
  genre: "exploration",
  setting: "forest with ancient ruins",
  timeOfDay: "day",
  goal: "collect every relic",
  storyline: "An explorer uncovers glowing ruins hidden deep in the woods.",
};

let dataDir: string;

function buildApp() {
  const llm = new LocalMockLLMClient();
  const contextStore = new InMemoryContextStore();
  const assetGenerator = new MockBlenderAssetGenerator(llm);
  const projectStore = new ProjectStore(dataDir);
  const app = createApp({ contextStore, llm, assetGenerator, projectStore });
  return { app, projectStore };
}

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "ai-gamedev-projects-"));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

describe("composeSetupPrompt", () => {
  it("phrases answers as a full build request", () => {
    const prompt = composeSetupPrompt(answers);
    expect(prompt).toContain('Create a exploration game called "Forest Exploration Ruins"');
    expect(prompt).toContain("set in forest with ancient ruins");
    expect(prompt).toContain("Objective: collect every relic");
    expect(prompt).toContain("Storyline:");
  });
});

describe("projects API", () => {
  it("starts empty", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/projects");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("creates a project and lists it", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    expect(created.status).toBe(201);
    expect(created.body.slug).toBe("forest-exploration-ruins");
    expect(created.body.hasBuild).toBe(false);
    expect(typeof created.body.initialPrompt).toBe("string");

    const list = await request(app).get("/api/projects");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].title).toBe("Forest Exploration Ruins");
  });

  it("rejects a project without a title", async () => {
    const { app } = buildApp();
    const res = await request(app)
      .post("/api/projects")
      .send({ ...answers, title: "" });
    expect(res.status).toBe(400);
  });

  it("builds a game scoped to the project and persists it", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    const id = created.body.id as string;

    const res = await request(app)
      .post(`/api/projects/${id}/chat`)
      .send({ message: created.body.initialPrompt });
    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.find((e) => e.type === "done")).toBeTruthy();

    const detail = await request(app).get(`/api/projects/${id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.context.blueprint).toBeTruthy();
    expect(detail.body.context.blueprint.entities.length).toBeGreaterThan(0);
    expect(detail.body.meta.hasBuild).toBe(true);

    // Global context is untouched — projects are isolated.
    const global = await request(app).get("/api/context");
    expect(global.body.blueprint).toBeFalsy();
  });

  it("edits the storyline via a follow-up", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    const id = created.body.id as string;
    await request(app).post(`/api/projects/${id}/chat`).send({ message: created.body.initialPrompt });

    const res = await request(app)
      .post(`/api/projects/${id}/chat`)
      .send({ message: "storyline: A lone ranger races the coming storm." });
    const events = parseSse(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.blueprint.pitch).toBe("A lone ranger races the coming storm.");
    }
  });

  it("returns 404 for an unknown project", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/projects/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("edits a project's scope", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    const id = created.body.id as string;

    const patched = await request(app)
      .patch(`/api/projects/${id}`)
      .send({ title: "Renamed Quest", genre: "dungeon", goal: "escape the crypt" });
    expect(patched.status).toBe(200);
    expect(patched.body.title).toBe("Renamed Quest");
    expect(patched.body.genre).toBe("dungeon");
    expect(patched.body.setup.goal).toBe("escape the crypt");

    // Persisted context reflects the new scope.
    const detail = await request(app).get(`/api/projects/${id}`);
    expect(detail.body.context.gameTitle).toBe("Renamed Quest");
    expect(detail.body.context.gameGenre).toBe("dungeon");
  });

  it("rejects an invalid genre or empty title on edit", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    const id = created.body.id as string;

    expect((await request(app).patch(`/api/projects/${id}`).send({ genre: "mmo" })).status).toBe(400);
    expect((await request(app).patch(`/api/projects/${id}`).send({ title: "  " })).status).toBe(400);
  });

  it("deletes a project", async () => {
    const { app } = buildApp();
    const created = await request(app).post("/api/projects").send(answers);
    const id = created.body.id as string;

    const del = await request(app).delete(`/api/projects/${id}`);
    expect(del.status).toBe(204);

    expect((await request(app).get(`/api/projects/${id}`)).status).toBe(404);
    expect((await request(app).get("/api/projects")).body).toEqual([]);
  });

  it("returns 404 when deleting an unknown project", async () => {
    const { app } = buildApp();
    const res = await request(app).delete("/api/projects/nope");
    expect(res.status).toBe(404);
  });
});
