import cors from "cors";
import express, { type Express } from "express";
import { isGameGenre, summarizeGame, type NewGame } from "@ai-gamedev/shared";
import { GameStore } from "./store.js";

export function createApp(store: GameStore = new GameStore()): Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", uptime: process.uptime() });
  });

  app.get("/api/games", (_req, res) => {
    res.json(store.list());
  });

  app.post("/api/games", (req, res) => {
    const body = req.body as Partial<NewGame>;
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const storyline = typeof body.storyline === "string" ? body.storyline.trim() : "";
    const genre = typeof body.genre === "string" ? body.genre : "";

    if (!title || !storyline || !isGameGenre(genre)) {
      res.status(400).json({
        error: "title, storyline and a valid genre are required",
      });
      return;
    }

    const game = store.create({ title, genre, storyline });
    console.log(`Created game: ${summarizeGame(game)}`);
    res.status(201).json(game);
  });

  return app;
}
