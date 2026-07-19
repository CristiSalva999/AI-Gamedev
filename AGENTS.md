# AGENTS.md

## Cursor Cloud specific instructions

This is an npm-workspaces monorepo (Node >= 22) with three packages: `shared`
(`@ai-gamedev/shared`, tsup library), `server` (`@ai-gamedev/server`, Express +
tsup, dev via `tsx watch`), and `web` (`@ai-gamedev/web`, React + Vite).
Standard commands live in `README.md` and the root `package.json` scripts — use
those; the notes below are only the non-obvious gotchas.

- Build `shared` before running/typechecking/testing `server` or `web`. Its
  `exports` point at `dist/`, so a stale/missing `shared/dist` breaks the other
  packages. The root `dev`, `test`, `typecheck`, and `build` scripts already run
  `build:shared` first — prefer the root scripts over per-workspace commands.
- `shared` has no watch step wired into dev. If you edit `shared/src`, re-run
  `npm run build:shared` (or `npm run dev` again) so `server`/`web` pick it up.
- Keep Vitest aligned with Vite 6 (use `vitest` v3). Vitest v2 pulls its own
  Vite 5, which creates a duplicate `vite` install and produces
  `vite.config.ts` type errors in `web`.
- `web/vite.config.ts` imports `defineConfig` from `vitest/config` (not `vite`)
  so the `test` block typechecks.
- Dev servers: server on `http://localhost:3001`, web on
  `http://localhost:5173`; the web dev server proxies `/api` to the server.
  The in-memory game store resets on every server restart.
