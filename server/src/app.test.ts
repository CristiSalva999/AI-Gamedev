import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import { GameStore } from "./store.js";

describe("server API", () => {
  it("reports health", async () => {
    const res = await request(createApp()).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });

  it("lists seeded games", async () => {
    const store = new GameStore([
      { title: "Test Quest", genre: "rpg", storyline: "A tiny adventure." },
    ]);
    const res = await request(createApp(store)).get("/api/games");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].title).toBe("Test Quest");
  });

  it("creates a game", async () => {
    const app = createApp(new GameStore());
    const res = await request(app)
      .post("/api/games")
      .send({ title: "Star Drift", genre: "shooter", storyline: "Save the galaxy." });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.genre).toBe("shooter");
  });

  it("rejects invalid genre", async () => {
    const app = createApp(new GameStore());
    const res = await request(app)
      .post("/api/games")
      .send({ title: "Bad", genre: "mmo", storyline: "nope" });
    expect(res.status).toBe(400);
  });
});
