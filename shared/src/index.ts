export type GameGenre =
  | "rpg"
  | "platformer"
  | "shooter"
  | "puzzle"
  | "strategy"
  | "adventure";

export interface Game {
  id: string;
  title: string;
  genre: GameGenre;
  storyline: string;
  createdAt: string;
}

export interface NewGame {
  title: string;
  genre: GameGenre;
  storyline: string;
}

export const GAME_GENRES: readonly GameGenre[] = [
  "rpg",
  "platformer",
  "shooter",
  "puzzle",
  "strategy",
  "adventure",
];

export function isGameGenre(value: string): value is GameGenre {
  return (GAME_GENRES as readonly string[]).includes(value);
}

/**
 * Produce a short, human-readable pitch for a game. Used by both the server
 * (to log new games) and the web app (to preview a game before saving).
 */
export function summarizeGame(game: Pick<Game, "title" | "genre" | "storyline">): string {
  const genre = game.genre.charAt(0).toUpperCase() + game.genre.slice(1);
  return `${game.title} — a ${genre} game: ${game.storyline}`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
