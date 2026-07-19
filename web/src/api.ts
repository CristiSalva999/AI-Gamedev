import type { Game, NewGame } from "@ai-gamedev/shared";

export async function fetchGames(): Promise<Game[]> {
  const res = await fetch("/api/games");
  if (!res.ok) {
    throw new Error(`Failed to load games (${res.status})`);
  }
  return (await res.json()) as Game[];
}

export async function createGame(input: NewGame): Promise<Game> {
  const res = await fetch("/api/games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Failed to create game (${res.status})`);
  }
  return (await res.json()) as Game;
}
