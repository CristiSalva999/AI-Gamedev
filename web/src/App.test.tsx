import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Game } from "@ai-gamedev/shared";
import { App } from "./App.js";

const sampleGames: Game[] = [
  {
    id: "1",
    title: "Echoes of Aria",
    genre: "rpg",
    storyline: "A bard rewrites reality.",
    createdAt: new Date().toISOString(),
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(sampleGames), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("App", () => {
  it("renders the studio heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /ai_gamedev studio/i })).toBeInTheDocument();
  });

  it("shows games loaded from the API", async () => {
    render(<App />);
    await waitFor(() => {
      expect(screen.getByText("Echoes of Aria")).toBeInTheDocument();
    });
  });
});
