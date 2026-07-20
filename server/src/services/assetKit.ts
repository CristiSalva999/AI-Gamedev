/**
 * Vendored CC0 asset kit (Kenney Nature / Castle / Fantasy Town subsets).
 * Matches natural-language briefs onto prebuilt .glb bases so offline and
 * mock builds look like real props instead of primitive placeholders.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface KitEntry {
  id: string;
  file: string;
  tags: string[];
}

export interface KitManifest {
  version: number;
  description?: string;
  entries: KitEntry[];
}

export interface KitMatch {
  entry: KitEntry;
  /** Absolute path to the kit .glb on disk. */
  absolutePath: string;
  /** URL served by the API for direct preview (no game slug needed). */
  kitUrl: string;
  score: number;
}

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../asset-kit");

let cached: KitManifest | null = null;

export function assetKitRoot(): string {
  return KIT_ROOT;
}

export async function loadAssetKitManifest(): Promise<KitManifest> {
  if (cached) return cached;
  const raw = await readFile(path.join(KIT_ROOT, "manifest.json"), "utf8");
  cached = JSON.parse(raw) as KitManifest;
  return cached;
}

/** Test helper: reset manifest cache. */
export function clearAssetKitCache(): void {
  cached = null;
}

/**
 * Score a brief against kit tags. Longer/more specific tag hits win so
 * "pine tree" prefers `tree_pine` over generic `tree_default`.
 */
export function scoreKitEntry(brief: string, entry: KitEntry): number {
  const text = brief.toLowerCase();
  let score = 0;
  for (const tag of entry.tags) {
    const t = tag.toLowerCase();
    if (!t) continue;
    if (text.includes(t)) {
      // Longer / multi-word tags beat generic ones ("pine tree" > "tree" + "grove").
      score += 10 + t.length * 3;
      continue;
    }
    // Whole-word token overlap only when the full tag did not match.
    for (const token of t.split(/\s+/)) {
      if (token.length >= 4 && new RegExp(`\\b${escapeRe(token)}\\b`).test(text)) {
        score += 3 + token.length;
      }
    }
  }
  return score;
}

export async function matchAssetKit(brief: string): Promise<KitMatch | null> {
  const manifest = await loadAssetKitManifest();
  let best: KitMatch | null = null;
  for (const entry of manifest.entries) {
    const score = scoreKitEntry(brief, entry);
    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = {
        entry,
        absolutePath: path.join(KIT_ROOT, entry.file),
        kitUrl: `/api/asset-kit/${entry.id}.glb`,
        score,
      };
    }
  }
  return best;
}

/** Copy a kit GLB into a game output folder as `{id}.glb`. */
export async function materializeKitAsset(
  match: KitMatch,
  outputDir: string,
  assetId: string,
): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const dest = path.join(outputDir, `${assetId}.glb`);
  await copyFile(match.absolutePath, dest);
  return dest;
}

export async function kitStats(): Promise<{ entries: number; root: string }> {
  const manifest = await loadAssetKitManifest();
  return { entries: manifest.entries.length, root: KIT_ROOT };
}

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
