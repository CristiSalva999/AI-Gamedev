# AGENTS.md

## Project overview

AI-assisted game development pipeline. An npm-workspaces monorepo:

- `shared/` — typed domain contract (`GameContext`, `Asset`, `AssetSpec`, `GameBlueprint`, `BuildEvent`, API types) + pure helpers. Consumed as TypeScript source by both other workspaces (no build step of its own).
- `server/` — Express orchestrator (default port `3001`). Endpoints: `/api/health`, `GET|POST /api/context`, `POST /api/generate`, `POST /api/generate-asset`, and the primary `POST /api/chat`. Hosts the autonomous build pipeline in `server/src/pipeline/`.
- `web/` — React chat UI + Three.js playable preview (Vite dev server on port `5173`).

### The autonomous pipeline (main flow)

`POST /api/chat` is the product's core. Given a natural-language message it either (a) runs the full **build pipeline** (`runBuild`) when the message asks for a new game, or (b) applies **live steering** (`runSteer`) to the existing `blueprint`. It streams **Server-Sent Events** (`BuildEvent`): `stage-start`, `sneak-peek` (carries a live `GameBlueprint` snapshot the viewport renders), `artifact`, `done`, etc. Build stages: design → world → assets → scripts → player → assemble → package. The final `GameBlueprint` is persisted in `context.blueprint`.

Standard scripts live in the root and per-workspace `package.json` (`dev`, `build`, `lint`, `test`, `typecheck`). Run them from the repo root; do not duplicate them here.

## Cursor Cloud specific instructions

- Run everything from the repo root. `npm run dev` starts backend (`:3001`) and frontend (`:5173`) together via `concurrently`; the Vite dev server proxies `/api/*` to the backend, so open only `http://localhost:5173`.
- No local LLM or Blender exists in the cloud VM, and that is fine: the app is designed to run fully offline.
  - The LLM client targets an OpenAI-compatible endpoint (LM Studio) at `http://localhost:1234/v1`. When it is unreachable the server automatically falls back to a **deterministic mock**; responses are tagged `source: "mock"` (vs `"llm"`). This is expected in the cloud — it is not a failure. Set `LLM_ALLOW_MOCK_FALLBACK=false` to force real calls and surface connection errors instead.
  - Blender is **mocked**: `POST /api/generate-asset` derives a renderable `AssetSpec` from the brief and returns an illustrative `bpy` script. No Blender install is needed.
  - Configure the real model via env (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); see `.env.example`. LM Studio ignores the API key value.
- Game state is persisted to `server/data/context.json` (gitignored), including the last built `blueprint` and a bounded `chat` transcript. It is auto-seeded on first request. Non-obvious gotcha: the persisted `blueprint` is re-rendered in the viewport on page load — delete the file to reset to a clean state.
- SSE gotcha (already handled, do not regress): the `/api/chat` handler listens for disconnects on the **response** (`res.on("close")`), not the request. `req`'s `close` can fire as soon as the request body is consumed, which would abort the stream before any event is sent.
- The pipeline and steering are deterministic and keyword-driven (`server/src/pipeline/heuristics.ts`) so builds are meaningful offline. Steering understands lighting (`night`/`day`/`dusk`/`cave`), `add <thing>`/`more <thing>`, player speed (`faster`/`slower`), and `clear`.
- Playable preview: the viewport renders the blueprint (themed lighting, animated entities) with a WASD/arrow-key player; click the canvas first to give it keyboard focus. Native/installable packaging and real Blender/animation are intentionally simulated in the `package` stage — future integration points, not yet real.
- Dev hot-reload: the server runs under `tsx watch` and the web app uses Vite HMR, so source edits reload automatically without restarting `npm run dev`.
- To verify the pipeline without a browser, hit the API directly, e.g. `curl -s -X POST http://localhost:3001/api/generate-asset -H 'Content-Type: application/json' -d '{"brief":"golden chest"}'`.
