import { describe, expect, it } from "vitest";
import request from "supertest";
import type { GameContext } from "@ai-gamedev/shared";
import type { BuildEvent } from "@ai-gamedev/shared";
import { createApp } from "../src/app.js";
import { MockBlenderAssetGenerator } from "../src/services/assetGenerator.js";
import {
  FakeLLMClient,
  InMemoryContextStore,
  LocalMockLLMClient,
} from "./support/fakes.js";

function parseSse(body: string): BuildEvent[] {
  return body
    .split("\n\n")
    .map((block) => block.replace(/^data: /, "").trim())
    .filter(Boolean)
    .map((json) => JSON.parse(json) as BuildEvent);
}

function buildApp(llm = new FakeLLMClient()) {
  const contextStore = new InMemoryContextStore();
  const assetGenerator = new MockBlenderAssetGenerator(llm);
  const app = createApp({ contextStore, llm, assetGenerator });
  return { app, llm, contextStore };
}

describe("GET /api/health", () => {
  it("reports LLM configuration and reachability", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.llm).toMatchObject({
      configured: true,
      reachable: false,
      model: "fake-model",
    });
  });
});

describe("context endpoints", () => {
  it("returns a seeded context and persists updates", async () => {
    const { app } = buildApp();

    const initial = await request(app).get("/api/context");
    expect(initial.status).toBe(200);
    expect(Object.keys(initial.body.assets.characters).length).toBeGreaterThan(0);

    const updated: GameContext = { ...initial.body, gameTitle: "Skyforge" };
    const saved = await request(app).post("/api/context").send(updated);
    expect(saved.status).toBe(200);
    expect(saved.body.gameTitle).toBe("Skyforge");

    const reloaded = await request(app).get("/api/context");
    expect(reloaded.body.gameTitle).toBe("Skyforge");
  });

  it("rejects malformed context payloads", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/api/context").send({ nope: true });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate", () => {
  it("builds an NPC dialogue prompt and records the reply in memory", async () => {
    const llm = new FakeLLMClient({ text: "Well met, traveler.", source: "mock" });
    const { app } = buildApp(llm);

    const res = await request(app)
      .post("/api/generate")
      .send({ task: "npcDialogue", params: { playerAction: "offers a coin" } });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ text: "Well met, traveler.", source: "mock" });
    expect(llm.calls[0]?.prompt).toContain("offers a coin");
    expect(llm.calls[0]?.options?.task).toBe("npcDialogue");

    const ctx = await request(app).get("/api/context");
    expect(ctx.body.conversationMemory.at(-1).content).toBe("Well met, traveler.");
  });

  it("returns 400 when task is missing", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/api/generate").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/generate-asset", () => {
  it("creates an asset, stores it, and returns a Blender script", async () => {
    const llm = new FakeLLMClient({ text: "import bpy\n# ...", source: "mock" });
    const { app } = buildApp(llm);

    const res = await request(app)
      .post("/api/generate-asset")
      .send({ brief: "wooden crate" });

    expect(res.status).toBe(201);
    expect(res.body.asset.spec.shape).toBe("box");
    expect(res.body.asset.spec.color).toBe("#8b5a2b");
    expect(res.body.blenderScript).toContain("import bpy");

    const ctx = await request(app).get("/api/context");
    expect(Object.keys(ctx.body.assets.models)).toHaveLength(1);
  });

  it("returns 400 when brief is missing", async () => {
    const { app } = buildApp();
    const res = await request(app).post("/api/generate-asset").send({});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/chat", () => {
  function buildChatApp() {
    const llm = new LocalMockLLMClient();
    const contextStore = new InMemoryContextStore();
    const assetGenerator = new MockBlenderAssetGenerator(llm);
    const app = createApp({ contextStore, llm, assetGenerator });
    return { app };
  }

  it("streams an autonomous build and persists the blueprint", async () => {
    const { app } = buildChatApp();

    const res = await request(app)
      .post("/api/chat")
      .send({ message: "create a dungeon crawler game" });

    expect(res.status).toBe(200);
    const events = parseSse(res.text);
    expect(events.some((e) => e.type === "artifact")).toBe(true);
    const done = events.find((e) => e.type === "done");
    expect(done?.type).toBe("done");

    const ctx = await request(app).get("/api/context");
    expect(ctx.body.blueprint).toBeTruthy();
    expect(ctx.body.blueprint.entities.length).toBeGreaterThan(0);
    expect(ctx.body.chat.length).toBeGreaterThan(0);
  });

  it("steers an existing build instead of rebuilding", async () => {
    const { app } = buildChatApp();
    await request(app).post("/api/chat").send({ message: "create a forest game" });

    const res = await request(app).post("/api/chat").send({ message: "make it night" });
    const events = parseSse(res.text);
    const done = events.find((e) => e.type === "done");
    expect(done?.type).toBe("done");
    if (done?.type === "done") {
      expect(done.blueprint.environment.lighting).toBe("night");
    }
  });

  it("returns 400 when message is missing", async () => {
    const { app } = buildChatApp();
    const res = await request(app).post("/api/chat").send({});
    expect(res.status).toBe(400);
  });
});
