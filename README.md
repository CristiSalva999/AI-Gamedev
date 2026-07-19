# ai_gamedev

Dev of games shouldn't be as chaotic as it is and hard for people to understand,
or the best games will never be made by people who actually have the right
storyline ideas.

This repo is an npm-workspaces monorepo with three packages:

- `shared/` — TypeScript library with shared types and helpers (`@ai-gamedev/shared`), built with tsup.
- `server/` — Express API (`@ai-gamedev/server`), built with tsup, dev via `tsx watch`.
- `web/` — React + Vite app (`@ai-gamedev/web`).

## Requirements

- Node.js >= 22 (see `.nvmrc`)

## Setup

```bash
npm install
```

## Development

```bash
npm run dev          # builds shared, then runs server (:3001) + web (:5173) together
npm run dev:server   # server only
npm run dev:web      # web only (proxies /api to the server)
```

The web app is served at http://localhost:5173 and proxies `/api` to the server
at http://localhost:3001.

## Quality gates

```bash
npm run lint         # ESLint (flat config) across the repo
npm test             # Vitest across all workspaces
npm run typecheck    # tsc --noEmit across all workspaces
npm run build        # builds shared, server, and web
```
