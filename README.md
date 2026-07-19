# AI GameDev

Chat-driven autonomous game development pipeline. Describe a game in the chatbot; the server builds concept → level → assets (`.glb`) → scripts → animations → playable package without further prompts. Steer live from chat. Download a zip and open `play.html` to play offline.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. Optional: start LM Studio on `http://localhost:1234/v1` (see `.env.example`).

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
