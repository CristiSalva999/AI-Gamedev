import { randomUUID } from "node:crypto";
import type { Game, NewGame } from "@ai-gamedev/shared";

/**
 * Tiny in-memory store for games. Swap for a real database later; the API
 * surface is intentionally small so it is easy to replace.
 */
export class GameStore {
  private games = new Map<string, Game>();

  constructor(seed: NewGame[] = []) {
    for (const game of seed) {
      this.create(game);
    }
  }

  list(): Game[] {
    return [...this.games.values()].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
  }

  get(id: string): Game | undefined {
    return this.games.get(id);
  }

  create(input: NewGame): Game {
    const game: Game = {
      id: randomUUID(),
      title: input.title,
      genre: input.genre,
      storyline: input.storyline,
      createdAt: new Date().toISOString(),
    };
    this.games.set(game.id, game);
    return game;
  }
}
