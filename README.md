# AI GameDev

Chat-driven autonomous game development pipeline. Describe a game in the chatbot; the server builds concept → level → assets (`.glb`) → scripts → animations → playable package without further prompts. Steer live from chat. Download a zip and open `play.html` to play offline.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### Local LM Studio + Blender (on your PC)

1. Start LM Studio → Local Server → model `gemma-4-26b-a4b-it` (same endpoint pi.dev uses: `http://127.0.0.1:1234`).
2. Copy `.env.example` → `server/.env` and set `BLENDER_BIN` to your `blender.exe` path.
3. From the repo: `npm install && npm run dev`
4. Badge should show **LLM · gemma…** and **blender** (not mock/procedural).

## Workspaces

| Package | Role |
|---------|------|
| `shared/` | Domain types (`GameBlueprint`, `BuildEvent`, animation clips) |
| `server/` | Express orchestrator + pipeline (`:3001`) |
| `web/` | React chat + Three.js preview (`:5173`) |

## Scripts

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```
