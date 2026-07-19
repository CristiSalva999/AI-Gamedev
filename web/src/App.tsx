import { useEffect, useState } from "react";
import {
  GAME_GENRES,
  summarizeGame,
  type Game,
  type GameGenre,
} from "@ai-gamedev/shared";
import { createGame, fetchGames } from "./api.js";

export function App(): React.JSX.Element {
  const [games, setGames] = useState<Game[]>([]);
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState<GameGenre>("rpg");
  const [storyline, setStoryline] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGames()
      .then(setGames)
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  async function onSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      const game = await createGame({ title, genre, storyline });
      setGames((prev) => [game, ...prev]);
      setTitle("");
      setStoryline("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <main className="app">
      <header className="hero">
        <h1>ai_gamedev Studio</h1>
        <p>Turn your storyline ideas into games — no chaos required.</p>
      </header>

      <section className="card">
        <h2>Pitch a new game</h2>
        <form onSubmit={onSubmit} className="form">
          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Echoes of Aria"
              required
            />
          </label>
          <label>
            Genre
            <select value={genre} onChange={(e) => setGenre(e.target.value as GameGenre)}>
              {GAME_GENRES.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
          <label>
            Storyline
            <textarea
              value={storyline}
              onChange={(e) => setStoryline(e.target.value)}
              placeholder="A bard rewrites reality by rediscovering forgotten songs."
              required
            />
          </label>
          {(title || storyline) && (
            <p className="preview">{summarizeGame({ title, genre, storyline })}</p>
          )}
          <button type="submit">Create game</button>
          {error && <p className="error">{error}</p>}
        </form>
      </section>

      <section className="card">
        <h2>Game library</h2>
        {loading ? (
          <p>Loading…</p>
        ) : games.length === 0 ? (
          <p>No games yet — pitch the first one above.</p>
        ) : (
          <ul className="games">
            {games.map((game) => (
              <li key={game.id} className="game">
                <span className={`badge badge-${game.genre}`}>{game.genre}</span>
                <div>
                  <strong>{game.title}</strong>
                  <p>{game.storyline}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
