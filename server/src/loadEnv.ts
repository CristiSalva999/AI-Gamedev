/**
 * Load `.env` files into `process.env` before config is read.
 *
 * Node does not load dotenv automatically. Without this, setting
 * `BLENDER_BIN=...` in server/.env has no effect and Blender stays
 * "procedural" even when the binary works from CMD.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function tryLoad(filePath: string): boolean {
  if (!existsSync(filePath)) return false;
  // Node 20.12+ / 22+: built-in env file loader (no dotenv dependency).
  process.loadEnvFile(filePath);
  return true;
}

/** Load the first existing env file from the usual project locations. */
export function loadEnvFiles(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Prefer server/.env next to the package (recommended for BLENDER_BIN).
    path.resolve(here, "../.env"),
    // Repo root .env when running via npm workspaces from the monorepo root.
    path.resolve(here, "../../.env"),
    // CWD fallbacks (tsx watch / different launch dirs).
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "server/.env"),
  ];

  const loaded: string[] = [];
  const seen = new Set<string>();
  for (const file of candidates) {
    const normalized = path.normalize(file);
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    try {
      if (tryLoad(normalized)) loaded.push(normalized);
    } catch (error) {
      console.warn(`[env] failed to load ${normalized}: ${(error as Error).message}`);
    }
  }
  return loaded;
}
