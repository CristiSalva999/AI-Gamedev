import {
  type Asset,
  type AssetSpec,
  type GameContext,
  type GenerationSource,
  type PrimitiveShape,
} from "@ai-gamedev/shared";
import { generatePrompt } from "../prompts.js";
import type { LLMClient } from "./llmClient.js";

export interface AssetGenerationResult {
  asset: Asset;
  blenderScript: string;
  source: GenerationSource;
}

/**
 * Turns a natural-language brief into a renderable asset. In the full pipeline
 * this drives Blender; here it asks the LLM for a Blender script (for display /
 * traceability) and derives a deterministic {@link AssetSpec} the viewport can
 * render immediately — the "mock Blender integration".
 */
export interface AssetGenerator {
  generate(brief: string, context: GameContext): Promise<AssetGenerationResult>;
}

const SHAPE_KEYWORDS: Array<[PrimitiveShape, string[]]> = [
  ["sphere", ["ball", "orb", "sphere", "rock", "boulder", "potion", "gem", "moon"]],
  ["cylinder", ["barrel", "pillar", "column", "trunk", "bottle", "tower", "log", "can"]],
  ["cone", ["cone", "tent", "spike", "pine", "roof", "hat", "dart"]],
  ["torus", ["ring", "torus", "donut", "wheel", "loop"]],
  ["box", ["crate", "box", "chest", "cube", "block", "brick", "table", "wall"]],
];

const COLOR_KEYWORDS: Array<[string, string[]]> = [
  ["#8b5a2b", ["wood", "wooden", "crate", "barrel", "log", "trunk"]],
  ["#ffd700", ["gold", "golden", "treasure", "coin"]],
  ["#9aa0a6", ["stone", "rock", "steel", "iron", "metal"]],
  ["#2ecc71", ["grass", "leaf", "green", "moss", "plant", "herb"]],
  ["#3498db", ["water", "ice", "crystal", "blue"]],
  ["#e74c3c", ["fire", "lava", "red", "ruby", "flame"]],
  ["#8e44ad", ["magic", "arcane", "purple", "amethyst"]],
];

export class MockBlenderAssetGenerator implements AssetGenerator {
  constructor(private readonly llm: LLMClient) {}

  async generate(
    brief: string,
    context: GameContext,
  ): Promise<AssetGenerationResult> {
    const prompt = generatePrompt.modelGeneration(brief, context);
    const { text: blenderScript, source } = await this.llm.generate(prompt, {
      task: "modelGeneration",
    });

    const spec = this.deriveSpec(brief, context);
    const asset: Asset = {
      id: `model_${slug(brief)}_${Date.now().toString(36)}`,
      name: brief.trim() || "asset",
      spec,
      createdAt: Date.now(),
    };

    return { asset, blenderScript, source };
  }

  /** Deterministic brief -> geometry mapping (pure, easily testable). */
  private deriveSpec(brief: string, context: GameContext): AssetSpec {
    const lower = brief.toLowerCase();
    const shape = matchKeyword(lower, SHAPE_KEYWORDS) ?? "box";
    const color =
      matchKeyword(lower, COLOR_KEYWORDS) ??
      pickFromPalette(brief, context.colorPalette);

    const scale = sizeMultiplier(lower);
    return {
      shape,
      color,
      size: { x: scale, y: scale, z: scale },
      roughness: 0.7,
      metalness: color === "#ffd700" || color === "#9aa0a6" ? 0.6 : 0.1,
    };
  }
}

function matchKeyword<T>(text: string, table: Array<[T, string[]]>): T | undefined {
  for (const [value, keywords] of table) {
    if (keywords.some((kw) => text.includes(kw))) return value;
  }
  return undefined;
}

function sizeMultiplier(text: string): number {
  if (/\b(giant|huge|massive|colossal|large|big)\b/.test(text)) return 2;
  if (/\b(small|tiny|little|mini)\b/.test(text)) return 0.5;
  return 1;
}

function pickFromPalette(brief: string, palette?: string[]): string {
  const fallback = ["#6c5ce7", "#00b894", "#fdcb6e", "#d63031"];
  const colors = palette && palette.length > 0 ? palette : fallback;
  let hash = 0;
  for (const ch of brief) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return colors[hash % colors.length];
}

function slug(text: string): string {
  return text.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "asset";
}
