# AGENTS.md

## Project overview

AI-assisted game development pipeline. An npm-workspaces monorepo:

- `shared/` — typed domain contract (`GameContext`, `Asset`, `AssetSpec`, API types) + pure helpers. Consumed as TypeScript source by both other workspaces (no build step of its own).
- `server/` — Express orchestrator (default port `3001`). Endpoints: `/api/health`, `GET|POST /api/context`, `POST /api/generate`, `POST /api/generate-asset`. Talks to a local LLM and generates assets.
- `web/` — React + Three.js viewport and control panel (Vite dev server on port `5173`).

Standard scripts live in the root and per-workspace `package.json` (`dev`, `build`, `lint`, `test`, `typecheck`). Run them from the repo root; do not duplicate them here.

## Cursor Cloud specific instructions

- Run everything from the repo root. `npm run dev` starts backend (`:3001`) and frontend (`:5173`) together via `concurrently`; the Vite dev server proxies `/api/*` to the backend, so open only `http://localhost:5173`.
- No local LLM or Blender exists in the cloud VM, and that is fine: the app is designed to run fully offline.
  - The LLM client targets an OpenAI-compatible endpoint (LM Studio) at `http://localhost:1234/v1`. When it is unreachable the server automatically falls back to a **deterministic mock**; responses are tagged `source: "mock"` (vs `"llm"`). This is expected in the cloud — it is not a failure. Set `LLM_ALLOW_MOCK_FALLBACK=false` to force real calls and surface connection errors instead.
  - Blender is **mocked**: `POST /api/generate-asset` derives a renderable `AssetSpec` from the brief and returns an illustrative `bpy` script. No Blender install is needed.
  - Configure the real model via env (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); see `.env.example`. LM Studio ignores the API key value.
- Game state is persisted to `server/data/context.json` (gitignored). It is auto-seeded on first request. Non-obvious gotcha: assets stored there are re-rendered in the viewport on page load — delete the file to reset the scene to a clean seeded state.
- Dev hot-reload: the server runs under `tsx watch` and the web app uses Vite HMR, so source edits reload automatically without restarting `npm run dev`.
- To verify the pipeline without a browser, hit the API directly, e.g. `curl -s -X POST http://localhost:3001/api/generate-asset -H 'Content-Type: application/json' -d '{"brief":"golden chest"}'`.
