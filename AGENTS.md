# AGENTS.md

## Project overview

AI-assisted game development pipeline. An npm-workspaces monorepo:

- `shared/` — typed domain contract (`GameContext`, `Asset`, `AssetSpec`, `GameBlueprint`, `BuildEvent`, animation clips, API types) + pure helpers. Consumed as TypeScript source by both other workspaces (no build step of its own).
- `server/` — Express orchestrator (default port `3001`). Endpoints: `/api/health`, `GET|POST /api/context`, `POST /api/generate`, `POST /api/generate-asset`, `POST /api/chat`, `GET /api/artifacts/:slug/download`. Hosts the autonomous build pipeline in `server/src/pipeline/`.
- `web/` — React chat UI + Three.js playable preview (Vite dev server on port `5173`).

### The autonomous pipeline (main flow)

`POST /api/chat` is the product's core. Given a natural-language message it either (a) runs the full **build pipeline** (`runBuild`) when the message asks for a new game, or (b) applies **live steering** (`runSteer`) to the existing `blueprint`. It streams **Server-Sent Events** (`BuildEvent`): `stage-start`, `sneak-peek` (carries a live `GameBlueprint` snapshot the viewport renders), `artifact`, `done`, etc. Build stages: design → world → assets → scripts → **animations** → player → assemble → **package**. The final `GameBlueprint` is persisted in `context.blueprint`; the package manifest (with `downloadUrl`) in `context.lastManifest`.

Standard scripts live in the root and per-workspace `package.json` (`dev`, `build`, `lint`, `test`, `typecheck`). Run them from the repo root; do not duplicate them here.

## Cursor Cloud specific instructions

- Run everything from the repo root. `npm run dev` starts backend (`:3001`) and frontend (`:5173`) together via `concurrently`; the Vite dev server proxies `/api/*` to the backend, so open only `http://localhost:5173`.
- No local LLM or Blender exists in the cloud VM, and that is fine: the app is designed to run fully offline.
  - The LLM client targets an OpenAI-compatible endpoint (LM Studio) at `http://localhost:1234/v1`. When it is unreachable the server automatically falls back to a **deterministic mock**; responses are tagged `source: "mock"` (vs `"llm"`). This is expected in the cloud — it is not a failure. Set `LLM_ALLOW_MOCK_FALLBACK=false` to force real calls and surface connection errors instead.
  - Asset generation uses `HybridBlenderAssetGenerator`: if a Blender binary is on `PATH` (or `BLENDER_BIN`), it runs headless; otherwise it writes **procedural `.glb`** files and returns an illustrative `bpy` script. Health reports `blender.mode: "blender" | "procedural"`.
  - Configure the real model via env (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`); see `.env.example`. LM Studio ignores the API key value.
- **Package stage is real now**: creates `server/data/games/<slug>/` with its own git branch (`game/<slug>`), writes `blueprint.json`, scripts, procedural `.glb` assets, a double-clickable `play.html`, and a downloadable `.zip` at `/api/artifacts/<slug>/download`. It does **not** switch the monorepo's checked-out branch (agents must stay on their working branch).
- **Animations are real keyframe clips** (`AnimationClip` / `KeyframeTrack` on the blueprint). The preview samples idle/walk for the player and spin/bob/patrol/pulse for props. Not skeletal/Blender armature yet — keyframed procedural motion.
- Game state is persisted to `server/data/context.json` (gitignored), including the last built `blueprint`, `lastManifest`, and a bounded `chat` transcript. It is auto-seeded on first request. Non-obvious gotcha: the persisted `blueprint` is re-rendered in the viewport on page load — delete the file (and optionally `server/data/games/`) to reset to a clean state.
- SSE gotcha (already handled, do not regress): the `/api/chat` handler listens for disconnects on the **response** (`res.on("close")`), not the request. `req`'s `close` can fire as soon as the request body is consumed, which would abort the stream before any event is sent.
- The pipeline and steering are deterministic and keyword-driven (`server/src/pipeline/heuristics.ts`) so builds are meaningful offline. Steering understands lighting (`night`/`day`/`dusk`/`cave`), `add <thing>`/`more <thing>`, player speed (`faster`/`slower`), and `clear`.
- Playable preview: the viewport renders the blueprint (themed lighting, animated entities) with a WASD/arrow-key player; click the canvas first to give it keyboard focus. After packaging, use **⤓ install zip** in the chat panel (or curl the artifact URL) and open `play.html` locally — no install step.
- Still future work (not blocking the chat→play loop): skeletal/armature animation from Blender, native Electron/Tauri installer wrappers around the zip, and committing generated games onto the monorepo remote.
- Dev hot-reload: the server runs under `tsx watch` and the web app uses Vite HMR, so source edits reload automatically without restarting `npm run dev`.
- To verify the pipeline without a browser, hit the API directly, e.g. `curl -s -X POST http://localhost:3001/api/generate-asset -H 'Content-Type: application/json' -d '{"brief":"golden chest"}'`, or stream a build with `curl -N -X POST http://localhost:3001/api/chat -H 'Content-Type: application/json' -d '{"message":"Create a forest exploration game"}'`.
